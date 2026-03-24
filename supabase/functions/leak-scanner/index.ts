import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Common API key patterns
const KEY_PATTERNS = [
  { name: "OpenAI", pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "Anthropic", pattern: /sk-ant-[a-zA-Z0-9-]{20,}/ },
  { name: "Google AI", pattern: /AIza[a-zA-Z0-9_-]{35}/ },
  { name: "Stripe", pattern: /sk_live_[a-zA-Z0-9]{20,}/ },
  { name: "Stripe Test", pattern: /sk_test_[a-zA-Z0-9]{20,}/ },
  { name: "AWS", pattern: /AKIA[A-Z0-9]{16}/ },
  { name: "GitHub", pattern: /ghp_[a-zA-Z0-9]{36}/ },
  { name: "Hugging Face", pattern: /hf_[a-zA-Z0-9]{34}/ },
  { name: "Cohere", pattern: /[a-zA-Z0-9]{40}/ },
  { name: "Replicate", pattern: /r8_[a-zA-Z0-9]{37}/ },
];

function scanForKeys(text: string): Array<{ provider: string; matched: string; masked: string }> {
  const findings: Array<{ provider: string; matched: string; masked: string }> = [];
  for (const { name, pattern } of KEY_PATTERNS) {
    const matches = text.match(new RegExp(pattern, "g"));
    if (matches) {
      for (const match of matches) {
        const masked = match.substring(0, 6) + "..." + match.substring(match.length - 4);
        findings.push({ provider: name, matched: match, masked });
      }
    }
  }
  return findings;
}

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

    // Service role client for privileged operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    const { agent_id, scan_minutes = 60 } = await req.json();

    const windowStart = new Date(Date.now() - scan_minutes * 60 * 1000).toISOString();

    // Validate agent ownership if agent_id provided
    if (agent_id) {
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
    }

    let query = supabase
      .from("agent_logs")
      .select("id, agent_id, raw_log, created_at")
      .eq("user_id", userId)
      .gte("created_at", windowStart);

    if (agent_id) query = query.eq("agent_id", agent_id);

    const { data: logs, error } = await query.limit(500);
    if (error) throw error;

    const allLeaks: Array<{ log_id: string; agent_id: string; provider: string; masked: string }> = [];

    for (const log of logs || []) {
      const rawText = JSON.stringify(log.raw_log || {});
      const findings = scanForKeys(rawText);
      for (const finding of findings) {
        allLeaks.push({ log_id: log.id, agent_id: log.agent_id, provider: finding.provider, masked: finding.masked });
      }
    }

    if (allLeaks.length > 0) {
      const agentLeaks = new Map<string, typeof allLeaks>();
      for (const leak of allLeaks) {
        const existing = agentLeaks.get(leak.agent_id) || [];
        existing.push(leak);
        agentLeaks.set(leak.agent_id, existing);
      }

      for (const [agId, leaks] of agentLeaks) {
        await supabase.from("alerts").insert({
          user_id: userId,
          agent_id: agId,
          alert_type: "key_leak",
          severity: "critical",
          title: `API key leak detected: ${leaks[0].provider}`,
          message: `Found ${leaks.length} exposed key(s) from ${leaks.map(l => l.provider).join(", ")}. Keys: ${leaks.map(l => l.masked).join(", ")}`,
          metadata: { leaks },
        });

        for (const leak of leaks) {
          await supabase.from("agent_api_keys")
            .update({ is_leaked: true, leak_detected_at: new Date().toISOString() })
            .eq("agent_id", agId)
            .eq("provider", leak.provider);
        }
      }

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "leak_scan_found",
        details: { total_leaks: allLeaks.length, agents_affected: [...agentLeaks.keys()] },
      });
    }

    return new Response(JSON.stringify({
      scanned_logs: (logs || []).length,
      leaks_found: allLeaks.length,
      leaks: allLeaks.map(l => ({ agent_id: l.agent_id, provider: l.provider, masked: l.masked })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Leak scanner error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
