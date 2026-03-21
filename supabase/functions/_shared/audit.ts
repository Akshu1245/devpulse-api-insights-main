// Audit logging utilities for Edge Functions
// @ts-nocheck

export async function logAudit(
  supabase: any,
  userId: string,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, any>,
  req?: Request
) {
  try {
    // Extract client IP from headers
    const ipAddress = req?.headers?.get("x-forwarded-for") || 
                      req?.headers?.get("cf-connecting-ip") || 
                      "unknown";
    const userAgent = req?.headers?.get("user-agent") || "unknown";

    const { error } = await supabase
      .rpc("log_audit_event", {
        p_user_id: userId,
        p_action: action,
        p_resource_type: resourceType,
        p_resource_id: resourceId || null,
        p_details: JSON.stringify(details || {}),
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_status: "success",
      });

    if (error) {
      console.error("[Audit] Failed to log event:", error);
    }
  } catch (err) {
    console.error("[Audit] Error in logAudit:", err);
  }
}

export async function logAuditError(
  supabase: any,
  userId: string,
  action: string,
  resourceType: string,
  errorMessage: string,
  resourceId?: string,
  req?: Request
) {
  try {
    const ipAddress = req?.headers?.get("x-forwarded-for") || 
                      req?.headers?.get("cf-connecting-ip") || 
                      "unknown";
    const userAgent = req?.headers?.get("user-agent") || "unknown";

    const { error } = await supabase
      .rpc("log_audit_event", {
        p_user_id: userId,
        p_action: action,
        p_resource_type: resourceType,
        p_resource_id: resourceId || null,
        p_details: JSON.stringify({}),
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_status: "error",
        p_error_message: errorMessage,
      });

    if (error) {
      console.error("[Audit] Failed to log error event:", error);
    }
  } catch (err) {
    console.error("[Audit] Error in logAuditError:", err);
  }
}
