import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    const { agent_id } = await req.json();
    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate agent ownership
    const { data: agent } = await supabase
      .from("agents")
      .select("max_api_calls_per_min, max_cost_per_task, max_reasoning_steps, status, name")
      .eq("id", agent_id)
      .eq("user_id", userId)
      .single();

    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const { count: recentCalls } = await supabase
      .from("agent_logs")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", agent_id)
      .gte("created_at", oneMinAgo);

    const violations: string[] = [];

    if (agent.max_api_calls_per_min && recentCalls && recentCalls >= agent.max_api_calls_per_min) {
      violations.push(`Rate limit exceeded: ${recentCalls}/${agent.max_api_calls_per_min} calls/min`);
    }

    const { data: taskLogs } = await supabase
      .from("agent_logs")
      .select("cost, step_number")
      .eq("agent_id", agent_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (taskLogs && taskLogs.length > 0) {
      const taskCost = taskLogs.reduce((s, l) => s + Number(l.cost || 0), 0);
      if (agent.max_cost_per_task && taskCost >= agent.max_cost_per_task) {
        violations.push(`Cost limit exceeded: $${taskCost.toFixed(2)}/$${agent.max_cost_per_task}`);
      }

      const maxStep = Math.max(...taskLogs.map(l => l.step_number));
      if (agent.max_reasoning_steps && maxStep >= agent.max_reasoning_steps) {
        violations.push(`Max reasoning steps exceeded: ${maxStep}/${agent.max_reasoning_steps}`);
      }
    }

    if (violations.length > 0) {
      await supabase.from("agents").update({ status: "paused" }).eq("id", agent_id);

      for (const v of violations) {
        await supabase.from("alerts").insert({
          user_id: userId,
          agent_id,
          alert_type: "rate_limit",
          severity: "critical",
          title: `Rate limit: ${agent.name}`,
          message: v,
        });
      }

      await supabase.from("audit_log").insert({
        user_id: userId,
        agent_id,
        action: "rate_limit_enforced",
        details: { violations },
      });
    }

    return new Response(JSON.stringify({
      allowed: violations.length === 0,
      violations,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Rate limiter error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
