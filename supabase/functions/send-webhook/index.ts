import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^240\./,
  /^localhost$/i,
  /^.*\.local$/i,
  /^::1$/,
  /^[fF][cCdD][0-9a-fA-F]{2}:/,
  /^[fF][eE][89aAbB][0-9a-fA-F]:/,
];

const isPrivateIP = (host: string): boolean => {
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(host)) return true;
  }
  return false;
};

const isValidWebhookUrl = (urlString: string): { valid: boolean; reason?: string } => {
  try {
    const url = new URL(urlString);
    
    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, reason: "Only HTTP and HTTPS protocols allowed" };
    }
    
    if (isPrivateIP(url.hostname)) {
      return { valid: false, reason: "Private IP addresses are not allowed" };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
};

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

    const { alert_type, title, message, severity } = await req.json();

    const { data: webhooks } = await supabase
      .from("webhook_configs")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    for (const wh of webhooks) {
      if (!wh.events.includes(alert_type)) continue;

      const urlValidation = isValidWebhookUrl(wh.url);
      if (!urlValidation.valid) {
        console.error(`Skipping webhook ${wh.id}: ${urlValidation.reason}`);
        continue;
      }

      let payload: Record<string, unknown>;

      if (wh.webhook_type === "slack") {
        payload = {
          text: `🛡️ *AgentGuard Alert* [${severity?.toUpperCase()}]\n*${title}*\n${message}`,
        };
      } else if (wh.webhook_type === "discord") {
        payload = {
          content: `🛡️ **AgentGuard Alert** [${severity?.toUpperCase()}]\n**${title}**\n${message}`,
        };
      } else {
        payload = { alert_type, title, message, severity, timestamp: new Date().toISOString() };
      }

      try {
        await fetch(wh.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        sent++;
      } catch (err) {
        console.error(`Failed to send webhook to ${wh.url}:`, err);
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook send error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
