export interface KillSwitchThresholds {
  /** Maximum API calls per second before triggering */
  maxRequestsPerSec: number;
  /** Maximum API calls per minute before triggering */
  maxRequestsPerMin: number;
  /** Maximum cost per minute (USD) before triggering */
  maxCostPerMin: number;
  /** Maximum cost per hour (USD) before triggering */
  maxCostPerHour: number;
  /** Maximum identical action repetitions in window before triggering */
  maxLoopRepetitions: number;
  /** Time window in seconds for loop detection */
  loopWindowSec: number;
  /** Maximum consecutive failures before triggering circuit breaker */
  maxConsecutiveFailures: number;
  /** Cooldown period in seconds after kill switch triggers */
  cooldownSec: number;
}

export const DEFAULT_THRESHOLDS: KillSwitchThresholds = {
  maxRequestsPerSec: 10,
  maxRequestsPerMin: 100,
  maxCostPerMin: 5.0,
  maxCostPerHour: 50.0,
  maxLoopRepetitions: 15,
  loopWindowSec: 60,
  maxConsecutiveFailures: 10,
  cooldownSec: 30,
};

export interface RequestRecord {
  timestamp: number;
  cost: number;
  action: string;
  agentId: string;
  success: boolean;
}

export type ViolationType =
  | "rapid_api_calls"
  | "cost_spike"
  | "infinite_loop"
  | "circuit_breaker";

export interface Violation {
  type: ViolationType;
  severity: "warning" | "critical";
  message: string;
  metric: string;
  threshold: number;
  actual: number;
  timestamp: number;
  agentId: string;
}

export type KillSwitchAction =
  | "block_api_key"
  | "pause_requests"
  | "send_alert"
  | "log_only";

export interface KillSwitchEvent {
  id: string;
  timestamp: number;
  violation: Violation;
  actionsTaken: KillSwitchAction[];
  resolved: boolean;
  resolvedAt?: number;
}

export type KillSwitchState = "armed" | "triggered" | "cooldown" | "disabled";

export interface KillSwitchStatus {
  state: KillSwitchState;
  triggeredAt?: number;
  cooldownUntil?: number;
  lastViolation?: Violation;
  totalTriggers: number;
  blockedApiKeys: Set<string>;
  pausedAgents: Set<string>;
}

export interface KillSwitchConfig {
  thresholds: KillSwitchThresholds;
  actions: Record<ViolationType, KillSwitchAction[]>;
  enabled: boolean;
}

export const DEFAULT_CONFIG: KillSwitchConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  actions: {
    rapid_api_calls: ["pause_requests", "send_alert"],
    cost_spike: ["block_api_key", "send_alert"],
    infinite_loop: ["pause_requests", "send_alert"],
    circuit_breaker: ["block_api_key", "send_alert"],
  },
  enabled: true,
};
