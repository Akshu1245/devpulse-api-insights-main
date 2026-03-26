"""
Autonomous Kill Switch Engine — DevPulse Agent Safety System
Detects and stops runaway AI agents by monitoring:
  - Request rate (rapid API calls / infinite loop signature)
  - Cost velocity (spend per minute)
  - Cumulative daily budget breaches

Detection happens in-process using sliding-window counters stored in
module-level state (no external dependency required for sub-second latency).
All trips write a structured event to Supabase for audit and dispatch
the existing alert channels.

Architecture
------------
                   LLM call  ──►  KillSwitchEngine.record_llm_call()
                   HTTP req  ──►  KillSwitchEngine.record_request()
                                       │
                            ┌──────────▼──────────┐
                            │   Detector checks   │
                            │  rate / cost / loop │
                            └──────────┬──────────┘
                                       │  trip
                            ┌──────────▼──────────┐
                            │  _trip_kill_switch() │
                            │  • block agent_id    │
                            │  • pause API key     │
                            │  • persist event     │
                            │  • dispatch alert    │
                            └─────────────────────┘
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

logger = logging.getLogger("kill_switch")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class KillSwitchConfig:
    """
    Thresholds that trigger the autonomous kill switch.

    All defaults are deliberately conservative; production values should
    be loaded from environment variables or Supabase per-user config.
    """

    # ── Request-rate detection (rapid API calls / loop signature) ──────────
    max_requests_per_second: float = 5.0
    """Block if an agent exceeds this call rate (reqs/s over a 10 s window)."""

    request_window_seconds: float = 10.0
    """Sliding window for rate measurement."""

    loop_burst_threshold: int = 20
    """Treat N identical endpoint calls within window_seconds as an infinite loop."""

    # ── Cost-velocity detection ─────────────────────────────────────────────
    max_cost_per_minute_inr: float = 50.0
    """Block if the agent spends more than this in any rolling 60-second window."""

    max_cost_per_hour_inr: float = 500.0
    """Block if hourly spend exceeds this amount."""

    max_daily_cost_inr: float = 2000.0
    """Hard daily budget cap — triggers kill switch when breached."""

    # ── Thinking-token anomaly ─────────────────────────────────────────────
    max_thinking_overhead_multiplier: float = 25.0
    """Block if thinking tokens are >N× the output cost for a single call."""

    # ── Auto-recovery ──────────────────────────────────────────────────────
    block_duration_seconds: float = 300.0
    """How long (s) a blocked agent stays blocked before auto-unblocking.
    Set to 0 to require manual release."""


# ---------------------------------------------------------------------------
# Trip reason
# ---------------------------------------------------------------------------


class TripReason(str, Enum):
    RATE_LIMIT = "rate_limit"  # too many requests/s
    INFINITE_LOOP = "infinite_loop"  # same endpoint repeated burst
    COST_PER_MINUTE = "cost_per_minute"  # spend velocity
    COST_PER_HOUR = "cost_per_hour"  # hourly budget
    DAILY_BUDGET = "daily_budget"  # hard daily cap
    THINKING_ANOMALY = "thinking_anomaly"  # runaway reasoning chain
    MANUAL = "manual"  # operator-triggered


# ---------------------------------------------------------------------------
# Kill-switch event (written to audit store)
# ---------------------------------------------------------------------------


@dataclass
class KillSwitchEvent:
    agent_id: str
    user_id: str
    reason: TripReason
    detail: str
    triggered_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    metrics_snapshot: dict[str, Any] = field(default_factory=dict)
    auto_release_at: str | None = None


# ---------------------------------------------------------------------------
# Per-agent sliding-window state
# ---------------------------------------------------------------------------


@dataclass
class _AgentState:
    """In-process mutable state for one agent."""

    request_times: deque = field(default_factory=deque)
    endpoint_calls: dict[str, deque] = field(default_factory=lambda: defaultdict(deque))
    cost_minute_window: deque = field(
        default_factory=deque
    )  # (timestamp, cost_inr) pairs
    cost_hour_window: deque = field(default_factory=deque)
    daily_cost_inr: float = 0.0
    daily_reset_date: str = ""
    blocked_until: float = 0.0  # epoch seconds; 0 = not blocked
    trip_count: int = 0


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class KillSwitchEngine:
    """
    Singleton-style engine — one instance per FastAPI process.

    Thread-safety note: all state mutations are guarded by Python's GIL;
    for multi-process deployments, replace _state with a Redis backend.
    """

    def __init__(self, config: KillSwitchConfig | None = None) -> None:
        self.config = config or KillSwitchConfig()
        self._state: dict[str, _AgentState] = defaultdict(_AgentState)
        self._blocked_keys: set[str] = set()  # blocked API key identifiers

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def is_blocked(self, agent_id: str) -> tuple[bool, str]:
        """
        Returns (True, reason) if the agent is currently blocked,
        or (False, "") if it is safe to proceed.
        Handles auto-release after block_duration_seconds.
        """
        state = self._state[agent_id]
        now = time.monotonic()
        if state.blocked_until > 0:
            if now < state.blocked_until:
                remaining = round(state.blocked_until - now, 1)
                return True, f"Agent blocked for {remaining}s more"
            else:
                # Auto-release
                state.blocked_until = 0.0
                logger.info("Kill switch auto-released for agent %s", agent_id)
        return False, ""

    def record_request(
        self,
        agent_id: str,
        user_id: str,
        endpoint: str,
    ) -> KillSwitchEvent | None:
        """
        Record one HTTP request from an agent.
        Returns a KillSwitchEvent if the call trips the kill switch, else None.
        """
        state = self._state[agent_id]
        now = time.monotonic()
        cfg = self.config

        # --- Maintain request-rate window ---------------------------------
        state.request_times.append(now)
        while (
            state.request_times
            and (now - state.request_times[0]) > cfg.request_window_seconds
        ):
            state.request_times.popleft()

        # --- Maintain per-endpoint loop window ----------------------------
        ep_deque = state.endpoint_calls[endpoint]
        ep_deque.append(now)
        while ep_deque and (now - ep_deque[0]) > cfg.request_window_seconds:
            ep_deque.popleft()

        # --- Rate check ---------------------------------------------------
        rate = len(state.request_times) / cfg.request_window_seconds
        if rate > cfg.max_requests_per_second:
            return self._trip(
                agent_id=agent_id,
                user_id=user_id,
                reason=TripReason.RATE_LIMIT,
                detail=f"Request rate {rate:.1f} req/s exceeds limit {cfg.max_requests_per_second} req/s",
                snapshot={
                    "rate_req_per_s": round(rate, 2),
                    "threshold": cfg.max_requests_per_second,
                    "window_s": cfg.request_window_seconds,
                    "endpoint": endpoint,
                },
            )

        # --- Infinite-loop check -----------------------------------------
        if len(ep_deque) >= cfg.loop_burst_threshold:
            return self._trip(
                agent_id=agent_id,
                user_id=user_id,
                reason=TripReason.INFINITE_LOOP,
                detail=(
                    f"Endpoint '{endpoint}' called {len(ep_deque)} times "
                    f"in {cfg.request_window_seconds}s (threshold={cfg.loop_burst_threshold})"
                ),
                snapshot={
                    "endpoint": endpoint,
                    "calls_in_window": len(ep_deque),
                    "threshold": cfg.loop_burst_threshold,
                    "window_s": cfg.request_window_seconds,
                },
            )

        return None

    def record_llm_call(
        self,
        agent_id: str,
        user_id: str,
        cost_inr: float,
        thinking_overhead_multiplier: float = 1.0,
        model: str = "",
    ) -> KillSwitchEvent | None:
        """
        Record one LLM API call's cost.
        Returns a KillSwitchEvent if any cost threshold is breached, else None.
        """
        state = self._state[agent_id]
        now = time.monotonic()
        cfg = self.config

        # --- Reset daily counter at UTC midnight -------------------------
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if state.daily_reset_date != today:
            state.daily_cost_inr = 0.0
            state.daily_reset_date = today

        state.daily_cost_inr += cost_inr

        # --- Maintain rolling cost windows --------------------------------
        state.cost_minute_window.append((now, cost_inr))
        state.cost_hour_window.append((now, cost_inr))

        while state.cost_minute_window and (now - state.cost_minute_window[0][0]) > 60:
            state.cost_minute_window.popleft()
        while state.cost_hour_window and (now - state.cost_hour_window[0][0]) > 3600:
            state.cost_hour_window.popleft()

        cost_last_minute = sum(c for _, c in state.cost_minute_window)
        cost_last_hour = sum(c for _, c in state.cost_hour_window)

        # --- Thinking-token anomaly --------------------------------------
        if thinking_overhead_multiplier >= cfg.max_thinking_overhead_multiplier:
            return self._trip(
                agent_id=agent_id,
                user_id=user_id,
                reason=TripReason.THINKING_ANOMALY,
                detail=(
                    f"Thinking overhead {thinking_overhead_multiplier:.1f}x exceeds "
                    f"limit {cfg.max_thinking_overhead_multiplier}x on model '{model}'"
                ),
                snapshot={
                    "thinking_overhead_multiplier": thinking_overhead_multiplier,
                    "threshold": cfg.max_thinking_overhead_multiplier,
                    "model": model,
                    "cost_inr": cost_inr,
                },
            )

        # --- Cost/minute check -------------------------------------------
        if cost_last_minute >= cfg.max_cost_per_minute_inr:
            return self._trip(
                agent_id=agent_id,
                user_id=user_id,
                reason=TripReason.COST_PER_MINUTE,
                detail=(
                    f"Spend INR{cost_last_minute:.2f} in last 60s "
                    f"exceeds limit INR{cfg.max_cost_per_minute_inr:.2f}/min"
                ),
                snapshot={
                    "cost_last_minute_inr": round(cost_last_minute, 2),
                    "threshold_inr": cfg.max_cost_per_minute_inr,
                    "model": model,
                },
            )

        # --- Cost/hour check ---------------------------------------------
        if cost_last_hour >= cfg.max_cost_per_hour_inr:
            return self._trip(
                agent_id=agent_id,
                user_id=user_id,
                reason=TripReason.COST_PER_HOUR,
                detail=(
                    f"Spend INR{cost_last_hour:.2f} in last 60 min "
                    f"exceeds limit INR{cfg.max_cost_per_hour_inr:.2f}/hr"
                ),
                snapshot={
                    "cost_last_hour_inr": round(cost_last_hour, 2),
                    "threshold_inr": cfg.max_cost_per_hour_inr,
                    "model": model,
                },
            )

        # --- Daily budget hard cap ---------------------------------------
        if state.daily_cost_inr >= cfg.max_daily_cost_inr:
            return self._trip(
                agent_id=agent_id,
                user_id=user_id,
                reason=TripReason.DAILY_BUDGET,
                detail=(
                    f"Daily spend INR{state.daily_cost_inr:.2f} "
                    f"exceeds daily budget INR{cfg.max_daily_cost_inr:.2f}"
                ),
                snapshot={
                    "daily_cost_inr": round(state.daily_cost_inr, 2),
                    "threshold_inr": cfg.max_daily_cost_inr,
                    "model": model,
                },
            )

        return None

    def manual_kill(
        self, agent_id: str, user_id: str, reason: str = ""
    ) -> KillSwitchEvent:
        """Operator-triggered kill — immediately blocks the agent."""
        return self._trip(
            agent_id=agent_id,
            user_id=user_id,
            reason=TripReason.MANUAL,
            detail=reason or "Manually triggered by operator",
            snapshot={"triggered_by": user_id},
        )

    def release(self, agent_id: str) -> bool:
        """Manually release a blocked agent. Returns True if it was blocked."""
        state = self._state.get(agent_id)
        if state and state.blocked_until > 0:
            state.blocked_until = 0.0
            logger.info("Kill switch manually released for agent %s", agent_id)
            return True
        return False

    def get_status(self, agent_id: str) -> dict[str, Any]:
        """Return the current metrics snapshot for an agent."""
        state = self._state.get(agent_id)
        if not state:
            return {"agent_id": agent_id, "status": "unknown"}

        now = time.monotonic()
        blocked, block_msg = self.is_blocked(agent_id)

        rate = (
            len(state.request_times) / self.config.request_window_seconds
            if state.request_times
            else 0.0
        )
        cost_last_minute = sum(c for _, c in state.cost_minute_window)
        cost_last_hour = sum(c for _, c in state.cost_hour_window)

        return {
            "agent_id": agent_id,
            "status": "blocked" if blocked else "active",
            "block_message": block_msg,
            "trip_count": state.trip_count,
            "metrics": {
                "request_rate_per_s": round(rate, 3),
                "cost_last_minute_inr": round(cost_last_minute, 4),
                "cost_last_hour_inr": round(cost_last_hour, 4),
                "daily_cost_inr": round(state.daily_cost_inr, 4),
            },
            "thresholds": {
                "max_requests_per_second": self.config.max_requests_per_second,
                "max_cost_per_minute_inr": self.config.max_cost_per_minute_inr,
                "max_cost_per_hour_inr": self.config.max_cost_per_hour_inr,
                "max_daily_cost_inr": self.config.max_daily_cost_inr,
            },
        }

    def block_api_key(self, api_key_id: str) -> None:
        """Register an API key as blocked (checked by proxy layer)."""
        self._blocked_keys.add(api_key_id)
        logger.warning("API key blocked: %s", api_key_id)

    def unblock_api_key(self, api_key_id: str) -> None:
        """Remove an API key from the blocked set."""
        self._blocked_keys.discard(api_key_id)
        logger.info("API key unblocked: %s", api_key_id)

    def is_api_key_blocked(self, api_key_id: str) -> bool:
        return api_key_id in self._blocked_keys

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    def _trip(
        self,
        agent_id: str,
        user_id: str,
        reason: TripReason,
        detail: str,
        snapshot: dict[str, Any],
    ) -> KillSwitchEvent:
        """
        Trip the kill switch for an agent.
        Blocks the agent, persists the event, and dispatches an alert.
        """
        state = self._state[agent_id]
        state.trip_count += 1

        now_monotonic = time.monotonic()
        cfg = self.config

        # Compute auto-release time
        if cfg.block_duration_seconds > 0:
            state.blocked_until = now_monotonic + cfg.block_duration_seconds
            release_dt = (
                datetime.now(timezone.utc).timestamp() + cfg.block_duration_seconds
            )
            auto_release_at = datetime.fromtimestamp(
                release_dt, tz=timezone.utc
            ).isoformat()
        else:
            state.blocked_until = float("inf")  # permanent until manual release
            auto_release_at = None

        event = KillSwitchEvent(
            agent_id=agent_id,
            user_id=user_id,
            reason=reason,
            detail=detail,
            metrics_snapshot=snapshot,
            auto_release_at=auto_release_at,
        )

        logger.warning(
            "KILL SWITCH TRIPPED | agent=%s user=%s reason=%s | %s",
            agent_id,
            user_id,
            reason.value,
            detail,
        )

        # Persist to Supabase (non-fatal if unavailable)
        self._persist_event(event)

        # Fire alert via existing dispatcher
        self._fire_alert(event)

        return event

    def _persist_event(self, event: KillSwitchEvent) -> None:
        try:
            from services.supabase_client import supabase

            row = {
                "agent_id": event.agent_id,
                "user_id": event.user_id,
                "action": f"kill_switch_{event.reason.value}",
                "details": {
                    "reason": event.reason.value,
                    "detail": event.detail,
                    "metrics_snapshot": event.metrics_snapshot,
                    "auto_release_at": event.auto_release_at,
                    "triggered_at": event.triggered_at,
                },
            }
            supabase.table("audit_log").insert(row).execute()

            # Also update the agents table status to "stopped"
            supabase.table("agents").update({"status": "stopped"}).eq(
                "id", event.agent_id
            ).execute()

            # Insert a critical alert visible in the dashboard
            supabase.table("alerts").insert(
                {
                    "user_id": event.user_id,
                    "agent_id": event.agent_id,
                    "alert_type": "error",
                    "severity": "critical",
                    "title": f"Kill switch tripped: {event.reason.value}",
                    "message": event.detail,
                }
            ).execute()

        except Exception:
            logger.exception(
                "Failed to persist kill switch event for agent %s", event.agent_id
            )

    def _fire_alert(self, event: KillSwitchEvent) -> None:
        try:
            from services.alert_dispatcher import (
                AlertEvent,
                AlertSeverity,
                AlertType,
                dispatch_alert_background,
            )
            from services.alert_config import get_user_config
            from services.supabase_client import supabase

            cfg_row = get_user_config(event.user_id)
            channels = _build_channels(cfg_row)

            alert = AlertEvent(
                alert_type=AlertType.COST_SPIKE,
                severity=AlertSeverity.CRITICAL,
                title=f"KILL SWITCH: {event.reason.value.replace('_', ' ').upper()} — agent {event.agent_id[:8]}",
                message=event.detail,
                user_id=event.user_id,
                metadata={
                    "agent_id": event.agent_id,
                    "reason": event.reason.value,
                    "auto_release_at": event.auto_release_at
                    or "manual release required",
                    **event.metrics_snapshot,
                },
            )
            dispatch_alert_background(alert, channels)
        except Exception:
            logger.exception(
                "Failed to dispatch kill switch alert for agent %s", event.agent_id
            )


# ---------------------------------------------------------------------------
# Helper: build ChannelConfig list from Supabase config row
# ---------------------------------------------------------------------------


def _build_channels(cfg_row: dict[str, Any]) -> list:
    from services.alert_dispatcher import ChannelConfig, ChannelType

    channels = []
    if cfg_row.get("slack_webhook_url"):
        channels.append(
            ChannelConfig(
                channel=ChannelType.SLACK,
                enabled=cfg_row.get("slack_enabled", False),
                slack_webhook_url=cfg_row["slack_webhook_url"],
            )
        )
    if cfg_row.get("email_to"):
        channels.append(
            ChannelConfig(
                channel=ChannelType.EMAIL,
                enabled=cfg_row.get("email_enabled", False),
                email_to=cfg_row["email_to"],
            )
        )
    return channels


# ---------------------------------------------------------------------------
# Module-level singleton used by middleware and routers
# ---------------------------------------------------------------------------

_engine: KillSwitchEngine | None = None


def get_engine() -> KillSwitchEngine:
    """Return (or lazily create) the process-wide kill switch engine."""
    global _engine
    if _engine is None:
        import os

        config = KillSwitchConfig(
            max_requests_per_second=float(os.getenv("KS_MAX_REQ_PER_SEC", "5")),
            request_window_seconds=float(os.getenv("KS_REQ_WINDOW_SEC", "10")),
            loop_burst_threshold=int(os.getenv("KS_LOOP_BURST", "20")),
            max_cost_per_minute_inr=float(os.getenv("KS_MAX_COST_PER_MIN_INR", "50")),
            max_cost_per_hour_inr=float(os.getenv("KS_MAX_COST_PER_HOUR_INR", "500")),
            max_daily_cost_inr=float(os.getenv("KS_MAX_DAILY_COST_INR", "2000")),
            max_thinking_overhead_multiplier=float(
                os.getenv("KS_MAX_THINKING_OVERHEAD", "25")
            ),
            block_duration_seconds=float(os.getenv("KS_BLOCK_DURATION_SEC", "300")),
        )
        _engine = KillSwitchEngine(config)
    return _engine
