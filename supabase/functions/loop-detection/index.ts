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

    const { agent_id, window_minutes = 5, repeat_threshold = 10 } = await req.json();

    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate agent ownership
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("id", agent_id)
      .eq("user_id", userId)
      .single();

    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const windowStart = new Date(Date.now() - window_minutes * 60 * 1000).toISOString();

    const { data: logs, error } = await supabase
      .from("agent_logs")
      .select("action_type, task_id, step_number, created_at")
      .eq("agent_id", agent_id)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const actionCounts: Record<string, number> = {};
    for (const log of logs || []) {
      const key = `${log.action_type}:${log.task_id || "no-task"}`;
      actionCounts[key] = (actionCounts[key] || 0) + 1;
    }

    const loops = Object.entries(actionCounts)
      .filter(([, count]) => count >= repeat_threshold)
      .map(([key, count]) => ({ action: key, repetitions: count }));

    if (loops.length > 0) {
      await supabase.from("agents").update({ status: "paused" }).eq("id", agent_id);

      await supabase.from("agent_logs")
        .update({ is_loop_detected: true })
        .eq("agent_id", agent_id)
        .gte("created_at", windowStart);

      await supabase.from("alerts").insert({
        user_id: userId,
        agent_id,
        alert_type: "loop_detected",
        severity: "critical",
        title: "Infinite loop detected",
        message: `Agent repeated "${loops[0].action}" ${loops[0].repetitions} times in ${window_minutes} minutes. Agent has been auto-paused.`,
        metadata: { loops, window_minutes },
      });

      await supabase.from("audit_log").insert({
        user_id: userId,
        agent_id,
        action: "loop_detected_auto_pause",
        details: { loops, window_minutes },
      });

      return new Response(JSON.stringify({
        loop_detected: true, loops, action_taken: "agent_paused",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ loop_detected: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Loop detection error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
