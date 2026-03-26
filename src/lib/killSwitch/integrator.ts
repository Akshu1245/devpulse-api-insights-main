import { getKillSwitchEngine } from "./engine";
import type { RequestRecord, Violation, KillSwitchAction } from "./types";
import { supabase } from "@/integrations/supabase/client";

export class KillSwitchIntegrator {
  private engine = getKillSwitchEngine();
  private userId: string | null = null;
  private alertQueue: Array<{ violation: Violation; agentId: string }> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.engine.onViolation((event) => this.handleViolation(event));
    this.flushTimer = setInterval(() => this.flushAlerts(), 5000);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
    this.flushAlerts();
  }

  trackRequest(
    agentId: string,
    action: string,
    cost: number = 0,
    success: boolean = true
  ): Violation[] {
    const record: RequestRecord = {
      timestamp: Date.now(),
      cost,
      action,
      agentId,
      success,
    };
    return this.engine.recordRequest(record);
  }

  isAgentPaused(agentId: string): boolean {
    const status = this.engine.getStatus();
    return status.pausedAgents.has(agentId);
  }

  isApiKeyBlocked(agentId: string): boolean {
    const status = this.engine.getStatus();
    return status.blockedApiKeys.has(agentId);
  }

  canProceed(agentId: string): { allowed: boolean; reason?: string } {
    const status = this.engine.getStatus();

    if (status.state === "disabled") return { allowed: true };

    if (status.state === "triggered") {
      if (status.pausedAgents.has(agentId)) {
        return { allowed: false, reason: "Agent paused by kill switch" };
      }
      if (status.blockedApiKeys.has(agentId)) {
        return { allowed: false, reason: "API key blocked by kill switch" };
      }
      return { allowed: false, reason: "Kill switch active" };
    }

    if (status.state === "cooldown") {
      return { allowed: false, reason: "Kill switch cooldown active" };
    }

    return { allowed: true };
  }

  private async handleViolation(event: {
    violation: Violation;
    actionsTaken: KillSwitchAction[];
  }): Promise<void> {
    if (event.actionsTaken.includes("send_alert")) {
      this.alertQueue.push({
        violation: event.violation,
        agentId: event.violation.agentId,
      });
    }

    if (event.actionsTaken.includes("pause_requests")) {
      await this.pauseAgentOnServer(event.violation.agentId, event.violation);
    }

    if (event.actionsTaken.includes("block_api_key")) {
      await this.blockApiKeyOnServer(event.violation.agentId, event.violation);
    }
  }

  private async pauseAgentOnServer(
    agentId: string,
    violation: Violation
  ): Promise<void> {
    try {
      await supabase
        .from("agents")
        .update({ status: "paused" })
        .eq("id", agentId);

      if (this.userId) {
        await supabase.from("audit_log").insert({
          user_id: this.userId,
          agent_id: agentId,
          action: "kill_switch_auto_pause",
          details: {
            type: violation.type,
            message: violation.message,
            metric: violation.metric,
            actual: violation.actual,
            threshold: violation.threshold,
          },
        });
      }
    } catch (err) {
      console.error("[KillSwitch] Failed to pause agent:", err);
    }
  }

  private async blockApiKeyOnServer(
    agentId: string,
    violation: Violation
  ): Promise<void> {
    try {
      await supabase
        .from("agents")
        .update({ status: "stopped" })
        .eq("id", agentId);

      if (this.userId) {
        await supabase.from("audit_log").insert({
          user_id: this.userId,
          agent_id: agentId,
          action: "kill_switch_api_key_blocked",
          details: {
            type: violation.type,
            message: violation.message,
          },
        });
      }
    } catch (err) {
      console.error("[KillSwitch] Failed to block API key:", err);
    }
  }

  private async flushAlerts(): Promise<void> {
    if (!this.userId || this.alertQueue.length === 0) return;

    const alerts = [...this.alertQueue];
    this.alertQueue = [];

    for (const { violation, agentId } of alerts) {
      try {
        await supabase.from("alerts").insert({
          user_id: this.userId,
          agent_id: agentId,
          alert_type: "kill_switch",
          severity: violation.severity,
          title: `Kill Switch: ${violation.type.replace(/_/g, " ")}`,
          message: violation.message,
          metadata: {
            type: violation.type,
            metric: violation.metric,
            threshold: violation.threshold,
            actual: violation.actual,
          },
        });
      } catch (err) {
        console.error("[KillSwitch] Failed to send alert:", err);
        this.alertQueue.push({ violation, agentId });
      }
    }
  }
}

let globalIntegrator: KillSwitchIntegrator | null = null;

export function getKillSwitchIntegrator(): KillSwitchIntegrator {
  if (!globalIntegrator) {
    globalIntegrator = new KillSwitchIntegrator();
  }
  return globalIntegrator;
}

export function resetKillSwitchIntegrator(): void {
  if (globalIntegrator) {
    globalIntegrator.destroy();
    globalIntegrator = null;
  }
}
