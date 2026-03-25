import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { encryptKey, decryptKey } from "../_shared/key-crypto.ts";
import { logAudit, logAuditError } from "../_shared/audit.ts";
import { assertSecretsValid } from "../_shared/secrets.ts";

type RequestBody =
  | { action: "list" }
  | { action: "resolve" }
  | { action: "upsert"; provider: string; key: string; keyAlias?: string }
  | { action: "delete"; id: string };

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate secrets at handler startup
  try {
    assertSecretsValid();
  } catch (err) {
    console.error("Secrets validation failed:", err);
    return new Response(
      JSON.stringify({ error: "Server misconfiguration. Please contact support." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let user: any = null;
  let body: any = null;

  try {
    const secret = Deno.env.get("KEY_ENCRYPTION_SECRET");
    if (!secret) {
      throw new Error("KEY_ENCRYPTION_SECRET not set");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");

    body = (await req.json()) as RequestBody;

    if (body.action === "list") {
      const { data, error } = await supabase
        .from("user_api_keys")
        .select("id, provider, encrypted_key, key_alias, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const masked = await Promise.all(
        (data ?? []).map(async (row) => {
          const plain = await decryptKey(row.encrypted_key, secret);
          return {
            id: row.id,
            provider: row.provider,
            key_alias: row.key_alias,
            masked_key: `${"•".repeat(Math.max(0, plain.length - 4))}${plain.slice(-4)}`,
            created_at: row.created_at,
          };
        })
      );

      return new Response(JSON.stringify({ keys: masked }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "resolve") {
      const { data, error } = await supabase
        .from("user_api_keys")
        .select("provider, encrypted_key")
        .eq("user_id", user.id);

      if (error) throw new Error(error.message);

      const keyMap: Record<string, string> = {};
      for (const row of data ?? []) {
        keyMap[row.provider] = await decryptKey(row.encrypted_key, secret);
      }

      return new Response(JSON.stringify({ keyMap }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "upsert") {
      if (!body.provider || !body.key) {
        throw new Error("provider and key are required");
      }

      const encryptedKey = await encryptKey(body.key, secret);

      const { data: existing } = await supabase
        .from("user_api_keys")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", body.provider)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from("user_api_keys")
          .update({ encrypted_key: encryptedKey, key_alias: body.keyAlias ?? body.provider })
          .eq("id", existing.id)
          .eq("user_id", user.id)
          .select("id, provider, key_alias")
          .single();

        if (error) throw new Error(error.message);

        // Log audit event
        await logAudit(supabase, user.id, "update_api_key", "user_api_keys", existing.id, 
          { provider: body.provider, key_alias: body.keyAlias }, req);

        return new Response(JSON.stringify({ key: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("user_api_keys")
        .insert({
          user_id: user.id,
          provider: body.provider,
          encrypted_key: encryptedKey,
          key_alias: body.keyAlias ?? body.provider,
        })
        .select("id, provider, key_alias")
        .single();

      if (error) throw new Error(error.message);

      // Log audit event
      await logAudit(supabase, user.id, "create_api_key", "user_api_keys", data.id, 
        { provider: body.provider, key_alias: body.keyAlias }, req);

      return new Response(JSON.stringify({ key: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "delete") {
      const { error } = await supabase
        .from("user_api_keys")
        .delete()
        .eq("id", body.id)
        .eq("user_id", user.id);

      if (error) throw new Error(error.message);

      // Log audit event
      await logAudit(supabase, user.id, "delete_api_key", "user_api_keys", body.id, {}, req);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    // Log error to audit trail if we have user context
    if (body?.action && user) {
      await logAuditError(supabase, user.id, body.action, "user_api_keys", 
        (error as Error).message, undefined, req).catch(e => console.error("Audit log failed:", e));
    }
    
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
