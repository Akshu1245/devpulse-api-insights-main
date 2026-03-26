import type {
  RequestRecord,
  Violation,
  ViolationType,
  KillSwitchThresholds,
  KillSwitchStatus,
  KillSwitchState,
  KillSwitchConfig,
  KillSwitchEvent,
  KillSwitchAction,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

export class KillSwitchEngine {
  private requestLog: RequestRecord[] = [];
  private status: KillSwitchStatus;
  private config: KillSwitchConfig;
  private eventLog: KillSwitchEvent[] = [];
  private listeners: Set<(event: KillSwitchEvent) => void> = new Set();
  private stateListeners: Set<(state: KillSwitchStatus) => void> = new Set();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<KillSwitchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = {
      state: this.config.enabled ? "armed" : "disabled",
      totalTriggers: 0,
      blockedApiKeys: new Set(),
      pausedAgents: new Set(),
    };
    this.cleanupTimer = setInterval(() => this.purgeStaleRecords(), 10_000);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.listeners.clear();
    this.stateListeners.clear();
  }

  configure(config: Partial<KillSwitchConfig>): void {
    this.config = { ...this.config, ...config };
    if (!config.enabled && this.status.state !== "disabled") {
      this.updateState("disabled");
    } else if (config.enabled && this.status.state === "disabled") {
      this.updateState("armed");
    }
  }

  getConfig(): KillSwitchConfig {
    return { ...this.config };
  }

  getStatus(): KillSwitchStatus {
    return { ...this.status };
  }

  getEventLog(): KillSwitchEvent[] {
    return [...this.eventLog];
  }

  onViolation(listener: (event: KillSwitchEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: (state: KillSwitchStatus) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  recordRequest(record: RequestRecord): Violation[] {
    if (this.status.state === "disabled") return [];

    if (this.status.state === "cooldown") {
      const now = Date.now();
      if (this.status.cooldownUntil && now < this.status.cooldownUntil) {
        return [];
      }
      this.updateState("armed");
    }

    if (this.status.state === "triggered") return [];

    this.requestLog.push(record);
    return this.detectViolations(record);
  }

  recordRequests(records: RequestRecord[]): Violation[] {
    const allViolations: Violation[] = [];
    for (const record of records) {
      const violations = this.recordRequest(record);
      allViolations.push(...violations);
    }
    return allViolations;
  }

  reset(): void {
    this.requestLog = [];
    this.status = {
      state: this.config.enabled ? "armed" : "disabled",
      totalTriggers: 0,
      blockedApiKeys: new Set(),
      pausedAgents: new Set(),
    };
    this.notifyStateListeners();
  }

  manualTrigger(violation: Violation): void {
    this.triggerKillSwitch(violation);
  }

  unblockApiKey(key: string): void {
    this.status.blockedApiKeys.delete(key);
    this.notifyStateListeners();
  }

  unpauseAgent(agentId: string): void {
    this.status.pausedAgents.delete(agentId);
    this.notifyStateListeners();
  }

  private detectViolations(record: RequestRecord): Violation[] {
    const now = Date.now();
    const { thresholds } = this.config;
    const violations: Violation[] = [];

    const rpsViolation = this.checkRequestsPerSec(now, thresholds, record);
    if (rpsViolation) violations.push(rpsViolation);

    const rpmViolation = this.checkRequestsPerMin(now, thresholds, record);
    if (rpmViolation) violations.push(rpmViolation);

    const costPerMinViolation = this.checkCostPerMin(now, thresholds, record);
    if (costPerMinViolation) violations.push(costPerMinViolation);

    const costPerHourViolation = this.checkCostPerHour(now, thresholds, record);
    if (costPerHourViolation) violations.push(costPerHourViolation);

    const loopViolation = this.checkInfiniteLoop(now, thresholds, record);
    if (loopViolation) violations.push(loopViolation);

    const circuitViolation = this.checkCircuitBreaker(now, thresholds, record);
    if (circuitViolation) violations.push(circuitViolation);

    if (violations.length > 0) {
      const mostSevere = violations.reduce((a, b) =>
        a.severity === "critical" ? a : b
      );
      this.triggerKillSwitch(mostSevere);
    }

    return violations;
  }

  private checkRequestsPerSec(
    now: number,
    thresholds: KillSwitchThresholds,
    record: RequestRecord
  ): Violation | null {
    const windowStart = now - 1000;
    const recent = this.requestLog.filter((r) => r.timestamp >= windowStart);
    const count = recent.length;

    if (count >= thresholds.maxRequestsPerSec) {
      return {
        type: "rapid_api_calls",
        severity: "critical",
        message: `Rapid API calls detected: ${count} requests/sec (threshold: ${thresholds.maxRequestsPerSec}/s)`,
        metric: "requests_per_sec",
        threshold: thresholds.maxRequestsPerSec,
        actual: count,
        timestamp: now,
        agentId: record.agentId,
      };
    }

    if (count >= thresholds.maxRequestsPerSec * 0.8) {
      return {
        type: "rapid_api_calls",
        severity: "warning",
        message: `High request rate: ${count} requests/sec approaching threshold (${thresholds.maxRequestsPerSec}/s)`,
        metric: "requests_per_sec",
        threshold: thresholds.maxRequestsPerSec,
        actual: count,
        timestamp: now,
        agentId: record.agentId,
      };
    }

    return null;
  }

  private checkRequestsPerMin(
    now: number,
    thresholds: KillSwitchThresholds,
    record: RequestRecord
  ): Violation | null {
    const windowStart = now - 60_000;
    const recent = this.requestLog.filter((r) => r.timestamp >= windowStart);
    const count = recent.length;

    if (count >= thresholds.maxRequestsPerMin) {
      return {
        type: "rapid_api_calls",
        severity: "critical",
        message: `Request rate limit exceeded: ${count} requests/min (threshold: ${thresholds.maxRequestsPerMin}/min)`,
        metric: "requests_per_min",
        threshold: thresholds.maxRequestsPerMin,
        actual: count,
        timestamp: now,
        agentId: record.agentId,
      };
    }

    return null;
  }

  private checkCostPerMin(
    now: number,
    thresholds: KillSwitchThresholds,
    record: RequestRecord
  ): Violation | null {
    const windowStart = now - 60_000;
    const recent = this.requestLog.filter((r) => r.timestamp >= windowStart);
    const totalCost = recent.reduce((sum, r) => sum + r.cost, 0);

    if (totalCost >= thresholds.maxCostPerMin) {
      return {
        type: "cost_spike",
        severity: "critical",
        message: `Cost spike detected: $${totalCost.toFixed(4)}/min (threshold: $${thresholds.maxCostPerMin}/min)`,
        metric: "cost_per_min",
        threshold: thresholds.maxCostPerMin,
        actual: totalCost,
        timestamp: now,
        agentId: record.agentId,
      };
    }

    if (totalCost >= thresholds.maxCostPerMin * 0.8) {
      return {
        type: "cost_spike",
        severity: "warning",
        message: `Cost approaching limit: $${totalCost.toFixed(4)}/min (threshold: $${thresholds.maxCostPerMin}/min)`,
        metric: "cost_per_min",
        threshold: thresholds.maxCostPerMin,
        actual: totalCost,
        timestamp: now,
        agentId: record.agentId,
      };
    }

    return null;
  }

  private checkCostPerHour(
    now: number,
    thresholds: KillSwitchThresholds,
    record: RequestRecord
  ): Violation | null {
    const windowStart = now - 3_600_000;
    const recent = this.requestLog.filter((r) => r.timestamp >= windowStart);
    const totalCost = recent.reduce((sum, r) => sum + r.cost, 0);

    if (totalCost >= thresholds.maxCostPerHour) {
      return {
        type: "cost_spike",
        severity: "critical",
        message: `Hourly cost spike: $${totalCost.toFixed(2)}/hr (threshold: $${thresholds.maxCostPerHour}/hr)`,
        metric: "cost_per_hour",
        threshold: thresholds.maxCostPerHour,
        actual: totalCost,
        timestamp: now,
        agentId: record.agentId,
      };
    }

    return null;
  }

  private checkInfiniteLoop(
    now: number,
    thresholds: KillSwitchThresholds,
    record: RequestRecord
  ): Violation | null {
    const windowStart = now - thresholds.loopWindowSec * 1000;
    const recent = this.requestLog.filter(
      (r) => r.timestamp >= windowStart && r.agentId === record.agentId
    );

    const actionCounts = new Map<string, number>();
    for (const r of recent) {
      const key = `${r.action}:${r.agentId}`;
      actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
    }

    for (const [key, count] of actionCounts) {
      if (count >= thresholds.maxLoopRepetitions) {
        const action = key.split(":")[0];
        return {
          type: "infinite_loop",
          severity: "critical",
          message: `Infinite loop detected: "${action}" repeated ${count} times in ${thresholds.loopWindowSec}s (threshold: ${thresholds.maxLoopRepetitions})`,
          metric: "action_repetitions",
          threshold: thresholds.maxLoopRepetitions,
          actual: count,
          timestamp: now,
          agentId: record.agentId,
        };
      }
    }

    return null;
  }

  private checkCircuitBreaker(
    now: number,
    thresholds: KillSwitchThresholds,
    record: RequestRecord
  ): Violation | null {
    if (record.success) return null;

    const windowStart = now - 30_000;
    const recentFailures = this.requestLog.filter(
      (r) =>
        r.timestamp >= windowStart &&
        !r.success &&
        r.agentId === record.agentId
    );

    let consecutive = 0;
    for (let i = this.requestLog.length - 1; i >= 0; i--) {
      const r = this.requestLog[i];
      if (r.agentId !== record.agentId) continue;
      if (!r.success) {
        consecutive++;
      } else {
        break;
      }
    }

    if (consecutive >= thresholds.maxConsecutiveFailures) {
      return {
        type: "circuit_breaker",
        severity: "critical",
        message: `Circuit breaker triggered: ${consecutive} consecutive failures (threshold: ${thresholds.maxConsecutiveFailures})`,
        metric: "consecutive_failures",
        threshold: thresholds.maxConsecutiveFailures,
        actual: consecutive,
        timestamp: now,
        agentId: record.agentId,
      };
    }

    return null;
  }

  private triggerKillSwitch(violation: Violation): void {
    this.updateState("triggered");
    this.status.lastViolation = violation;
    this.status.totalTriggers++;
    this.status.triggeredAt = violation.timestamp;

    const actions = this.config.actions[violation.type] || ["send_alert"];
    const actionsTaken: KillSwitchAction[] = [];

    for (const action of actions) {
      switch (action) {
        case "block_api_key":
          this.status.blockedApiKeys.add(violation.agentId);
          actionsTaken.push("block_api_key");
          break;
        case "pause_requests":
          this.status.pausedAgents.add(violation.agentId);
          actionsTaken.push("pause_requests");
          break;
        case "send_alert":
          actionsTaken.push("send_alert");
          break;
        case "log_only":
          actionsTaken.push("log_only");
          break;
      }
    }

    const event: KillSwitchEvent = {
      id: `ks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: violation.timestamp,
      violation,
      actionsTaken,
      resolved: false,
    };

    this.eventLog.push(event);
    this.notifyListeners(event);
    this.notifyStateListeners();

    if (this.config.thresholds.cooldownSec > 0) {
      this.status.cooldownUntil =
        violation.timestamp + this.config.thresholds.cooldownSec * 1000;
      setTimeout(() => {
        if (this.status.state === "cooldown") {
          this.updateState("armed");
        }
      }, this.config.thresholds.cooldownSec * 1000);
    }
  }

  private updateState(newState: KillSwitchState): void {
    this.status.state = newState;
    this.notifyStateListeners();
  }

  private purgeStaleRecords(): void {
    const cutoff = Date.now() - 3_600_000;
    this.requestLog = this.requestLog.filter((r) => r.timestamp >= cutoff);
  }

  private notifyListeners(event: KillSwitchEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener error — continue
      }
    }
  }

  private notifyStateListeners(): void {
    for (const listener of this.stateListeners) {
      try {
        listener(this.status);
      } catch {
        // listener error — continue
      }
    }
  }
}

let globalEngine: KillSwitchEngine | null = null;

export function getKillSwitchEngine(
  config?: Partial<KillSwitchConfig>
): KillSwitchEngine {
  if (!globalEngine) {
    globalEngine = new KillSwitchEngine(config);
  }
  return globalEngine;
}

export function resetKillSwitchEngine(): void {
  if (globalEngine) {
    globalEngine.destroy();
    globalEngine = null;
  }
}
