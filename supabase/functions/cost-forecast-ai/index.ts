import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const slope = typeof body?.slope === "number" ? body.slope : 0;
    const predicted_14d_total = typeof body?.predicted_14d_total === "number" ? body.predicted_14d_total : 0;

    // Lovable API removed. Only fallback summary is provided.
    const trendWord = slope > 0 ? "increasing" : slope < 0 ? "decreasing" : "stable";
    return new Response(
      JSON.stringify({
        summary: `Your spending is ${trendWord}. Predicted 14-day cost: $${predicted_14d_total.toFixed(2)}. ${slope > 0.01 ? "Consider reviewing your agent cost limits to prevent overspend." : "Your costs look well-controlled."}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Forecast AI error:", error);
    return new Response(
      JSON.stringify({ summary: "Unable to generate AI forecast at this time." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
