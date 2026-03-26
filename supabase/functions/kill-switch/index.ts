import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface Thresholds {
  max_requests_per_sec: number;
  max_requests_per_min: number;
  max_cost_per_min: number;
  max_cost_per_hour: number;
  max_loop_repetitions: number;
  loop_window_sec: number;
  max_consecutive_failures: number;
  cooldown_sec: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  max_requests_per_sec: 10,
  max_requests_per_min: 100,
  max_cost_per_min: 5.0,
  max_cost_per_hour: 50.0,
  max_loop_repetitions: 15,
  loop_window_sec: 60,
  max_consecutive_failures: 10,
  cooldown_sec: 30,
};

interface ViolationResult {
  type: string;
  severity: "warning" | "critical";
  message: string;
  metric: string;
  threshold: number;
  actual: number;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
        Deno.env.get("SERVICE_ROLE_KEY") ??
        ""
    );

    const body = await req.json();
    const { agent_id, thresholds: customThresholds, action: requestAction } = body;

    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const thresholds: Thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...customThresholds,
    };

    const { data: agent } = await supabase
      .from("agents")
      .select(
        "id, name, status, max_api_calls_per_min, max_cost_per_task, max_reasoning_steps"
      )
      .eq("id", agent_id)
      .eq("user_id", userId)
      .single();

    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (requestAction === "check") {
      const violations = await runDetection(
        supabase,
        agent_id,
        agent,
        thresholds,
        userId
      );

      if (violations.length > 0) {
        const mostSevere = violations.reduce((a, b) =>
          a.severity === "critical" ? a : b
        );
        await executeActions(supabase, agent_id, agent.name, violations, userId);

        return new Response(
          JSON.stringify({
            triggered: true,
            violations,
            actions_taken: getActionsForType(mostSevere.type),
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ triggered: false, violations: [] }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (requestAction === "manual_trigger") {
      const reason = body.reason || "Manual kill switch activation";
      await supabase.from("agents").update({ status: "stopped" }).eq("id", agent_id);

      await supabase.from("alerts").insert({
        user_id: userId,
        agent_id,
        alert_type: "kill_switch",
        severity: "critical",
        title: `Kill switch: ${agent.name}`,
        message: reason,
      });

      await supabase.from("audit_log").insert({
        user_id: userId,
        agent_id,
        action: "kill_switch_manual",
        details: { reason, agent_name: agent.name },
      });

      return new Response(
        JSON.stringify({ triggered: true, message: "Agent stopped" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (requestAction === "resume") {
      await supabase.from("agents").update({ status: "active" }).eq("id", agent_id);

      await supabase.from("audit_log").insert({
        user_id: userId,
        agent_id,
        action: "kill_switch_resume",
        details: { agent_name: agent.name },
      });

      return new Response(
        JSON.stringify({ resumed: true }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (requestAction === "status") {
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      const { count: recentCalls } = await supabase
        .from("agent_logs")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", agent_id)
        .gte("created_at", oneMinAgo);

      const { data: recentLogs } = await supabase
        .from("agent_logs")
        .select("cost, step_number, action_type, created_at")
        .eq("agent_id", agent_id)
        .order("created_at", { ascending: false })
        .limit(200);

      const totalCostMin = (recentLogs || [])
        .filter(
          (l) =>
            new Date(l.created_at).getTime() > Date.now() - 60000
        )
        .reduce((s, l) => s + Number(l.cost || 0), 0);

      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const totalCostHour = (recentLogs || [])
        .filter((l) => new Date(l.created_at).getTime() > Date.now() - 3600000)
        .reduce((s, l) => s + Number(l.cost || 0), 0);

      const loopChecks = detectLoops(recentLogs || [], thresholds);

      return new Response(
        JSON.stringify({
          agent_id,
          agent_name: agent.name,
          status: agent.status,
          metrics: {
            requests_per_min: recentCalls || 0,
            cost_per_min: totalCostMin,
            cost_per_hour: totalCostHour,
            loop_detected: loopChecks.length > 0,
            loops: loopChecks,
          },
          thresholds,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Kill switch error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runDetection(
  supabase: any,
  agentId: string,
  agent: any,
  thresholds: Thresholds,
  userId: string
): Promise<ViolationResult[]> {
  const violations: ViolationResult[] = [];

  const oneSecAgo = new Date(Date.now() - 1000).toISOString();
  const { count: rpsCount } = await supabase
    .from("agent_logs")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", oneSecAgo);

  if (rpsCount && rpsCount >= thresholds.max_requests_per_sec) {
    violations.push({
      type: "rapid_api_calls",
      severity: "critical",
      message: `${rpsCount} requests/sec (threshold: ${thresholds.max_requests_per_sec}/s)`,
      metric: "requests_per_sec",
      threshold: thresholds.max_requests_per_sec,
      actual: rpsCount,
    });
  }

  const oneMinAgo = new Date(Date.now() - 60000).toISOString();
  const { count: rpmCount } = await supabase
    .from("agent_logs")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", oneMinAgo);

  if (rpmCount && rpmCount >= thresholds.max_requests_per_min) {
    violations.push({
      type: "rapid_api_calls",
      severity: "critical",
      message: `${rpmCount} requests/min (threshold: ${thresholds.max_requests_per_min}/min)`,
      metric: "requests_per_min",
      threshold: thresholds.max_requests_per_min,
      actual: rpmCount,
    });
  }

  const { data: costLogs } = await supabase
    .from("agent_logs")
    .select("cost, created_at")
    .eq("agent_id", agentId)
    .gte("created_at", oneMinAgo);

  const costPerMin = (costLogs || []).reduce(
    (s: number, l: any) => s + Number(l.cost || 0),
    0
  );

  if (costPerMin >= thresholds.max_cost_per_min) {
    violations.push({
      type: "cost_spike",
      severity: "critical",
      message: `$${costPerMin.toFixed(4)}/min (threshold: $${thresholds.max_cost_per_min}/min)`,
      metric: "cost_per_min",
      threshold: thresholds.max_cost_per_min,
      actual: costPerMin,
    });
  }

  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: hourLogs } = await supabase
    .from("agent_logs")
    .select("cost")
    .eq("agent_id", agentId)
    .gte("created_at", oneHourAgo);

  const costPerHour = (hourLogs || []).reduce(
    (s: number, l: any) => s + Number(l.cost || 0),
    0
  );

  if (costPerHour >= thresholds.max_cost_per_hour) {
    violations.push({
      type: "cost_spike",
      severity: "critical",
      message: `$${costPerHour.toFixed(2)}/hr (threshold: $${thresholds.max_cost_per_hour}/hr)`,
      metric: "cost_per_hour",
      threshold: thresholds.max_cost_per_hour,
      actual: costPerHour,
    });
  }

  const windowStart = new Date(
    Date.now() - thresholds.loop_window_sec * 1000
  ).toISOString();
  const { data: loopLogs } = await supabase
    .from("agent_logs")
    .select("action_type, task_id, step_number, created_at")
    .eq("agent_id", agentId)
    .gte("created_at", windowStart)
    .limit(200);

  const loops = detectLoops(loopLogs || [], thresholds);
  for (const loop of loops) {
    violations.push({
      type: "infinite_loop",
      severity: "critical",
      message: `"${loop.action}" repeated ${loop.repetitions} times in ${thresholds.loop_window_sec}s`,
      metric: "action_repetitions",
      threshold: thresholds.max_loop_repetitions,
      actual: loop.repetitions,
    });
  }

  return violations;
}

function detectLoops(
  logs: any[],
  thresholds: Thresholds
): Array<{ action: string; repetitions: number }> {
  const actionCounts: Record<string, number> = {};
  for (const log of logs) {
    const key = `${log.action_type}:${log.task_id || "no-task"}`;
    actionCounts[key] = (actionCounts[key] || 0) + 1;
  }

  return Object.entries(actionCounts)
    .filter(([, count]) => count >= thresholds.max_loop_repetitions)
    .map(([key, count]) => ({ action: key, repetitions: count }));
}

async function executeActions(
  supabase: any,
  agentId: string,
  agentName: string,
  violations: ViolationResult[],
  userId: string
): Promise<void> {
  const hasCostSpike = violations.some((v) => v.type === "cost_spike");
  const hasLoop = violations.some((v) => v.type === "infinite_loop");
  const hasRapidCalls = violations.some((v) => v.type === "rapid_api_calls");

  if (hasCostSpike) {
    await supabase.from("agents").update({ status: "stopped" }).eq("id", agentId);
  } else if (hasLoop || hasRapidCalls) {
    await supabase.from("agents").update({ status: "paused" }).eq("id", agentId);
  }

  for (const v of violations) {
    await supabase.from("alerts").insert({
      user_id: userId,
      agent_id: agentId,
      alert_type: "kill_switch",
      severity: v.severity,
      title: `Kill Switch: ${agentName} — ${v.type.replace(/_/g, " ")}`,
      message: v.message,
      metadata: {
        type: v.type,
        metric: v.metric,
        threshold: v.threshold,
        actual: v.actual,
      },
    });
  }

  await supabase.from("audit_log").insert({
    user_id: userId,
    agent_id: agentId,
    action: "kill_switch_auto",
    details: {
      violations,
      agent_name: agentName,
    },
  });
}

function getActionsForType(type: string): string[] {
  switch (type) {
    case "cost_spike":
      return ["block_api_key", "send_alert"];
    case "rapid_api_calls":
      return ["pause_requests", "send_alert"];
    case "infinite_loop":
      return ["pause_requests", "send_alert"];
    case "circuit_breaker":
      return ["block_api_key", "send_alert"];
    default:
      return ["send_alert"];
  }
}
