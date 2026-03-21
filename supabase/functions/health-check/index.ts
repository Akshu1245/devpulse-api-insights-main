// Health Check Function
// Monitors the status of critical system components
// @ts-nocheck

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  services: {
    database: { status: string; latency_ms: number; error?: string };
    auth: { status: string; latency_ms: number; error?: string };
    storage: { status: string; latency_ms: number; error?: string };
    api_keys: { status: string; latency_ms: number; error?: string };
  };
  version: string;
}

async function checkDatabase(supabase: any): Promise<any> {
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("count")
      .limit(1);
    
    if (error) throw error;
    
    return {
      status: "ok",
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    const message = (e as Error).message;
    return {
      status: message.includes("permission denied") ? "degraded" : "error",
      latency_ms: Date.now() - start,
      error: message,
    };
  }
}

async function checkAuth(supabase: any): Promise<any> {
  const start = Date.now();
  try {
    // Just verify we can create an auth client
    const { data, error } = await supabase.auth.getSession();
    
    if (error) throw error;
    
    return {
      status: "ok",
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    const message = (e as Error).message;
    return {
      status: message.includes("permission denied") ? "degraded" : "error",
      latency_ms: Date.now() - start,
      error: message,
    };
  }
}

async function checkEncryption(): Promise<any> {
  const start = Date.now();
  try {
    const secret = Deno.env.get("KEY_ENCRYPTION_SECRET");
    if (!secret || secret.length < 32) {
      throw new Error("Encryption secret not properly configured");
    }
    
    return {
      status: "ok",
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    const message = (e as Error).message;
    return {
      status: message.includes("permission denied") ? "degraded" : "error",
      latency_ms: Date.now() - start,
      error: message,
    };
  }
}

async function checkApiKeys(supabase: any): Promise<any> {
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from("user_api_keys")
      .select("count")
      .limit(1);
    
    if (error) throw error;
    
    return {
      status: "ok",
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    const message = (e as Error).message;
    return {
      status: message.includes("permission denied") ? "degraded" : "error",
      latency_ms: Date.now() - start,
      error: message,
    };
  }
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const [db, auth, encryption, apiKeys] = await Promise.all([
      checkDatabase(supabase),
      checkAuth(supabase),
      checkEncryption(),
      checkApiKeys(supabase),
    ]);

    const statuses = [db, auth, encryption, apiKeys];
    const hasError = statuses.some(s => s.status === "error");
    const hasDegraded = statuses.some(s => s.status === "degraded");

    const health: HealthStatus = {
      status: hasError ? "error" : hasDegraded ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: db,
        auth: auth,
        storage: encryption,
        api_keys: apiKeys,
      },
      version: "1.0.0",
    };

    const statusCode = health.status === "ok" ? 200 : health.status === "degraded" ? 200 : 503;

    return new Response(JSON.stringify(health), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: statusCode,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: "error",
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
