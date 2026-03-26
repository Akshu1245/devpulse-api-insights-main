"""Alert rules engine — evaluates events and produces AlertEvents when thresholds
are breached.

Two rule families:
  1. Vulnerability rules  — fire on critical/high security findings
  2. Cost-spike rules     — fire when LLM spend crosses a configured threshold
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from services.alert_dispatcher import AlertEvent, AlertSeverity, AlertType

logger = logging.getLogger("alert_rules")


# ── Rule configuration ───────────────────────────────────────────────────────


@dataclass
class VulnerabilityRuleConfig:
    min_severity: AlertSeverity = AlertSeverity.HIGH
    """Fire an alert for any finding at this severity or above."""


@dataclass
class CostSpikeRuleConfig:
    daily_threshold_inr: float = 500.0
    """Alert when daily cost exceeds this amount."""
    single_entry_threshold_inr: float = 100.0
    """Alert when a single LLM call costs more than this."""
    hourly_rate_multiplier: float = 3.0
    """Alert when current hourly rate is > N× the 7-day average."""


# ── Vulnerability rule ──────────────────────────────────────────────────────

_SEVERITY_ORDER = {
    AlertSeverity.CRITICAL: 4,
    AlertSeverity.HIGH: 3,
    AlertSeverity.MEDIUM: 2,
    AlertSeverity.LOW: 1,
    AlertSeverity.INFO: 0,
}


def evaluate_vulnerability(
    *,
    user_id: str,
    endpoint: str,
    findings: list[dict[str, Any]],
    config: VulnerabilityRuleConfig | None = None,
) -> list[AlertEvent]:
    """Return AlertEvents for each finding that meets the severity threshold."""
    cfg = config or VulnerabilityRuleConfig()
    threshold = _SEVERITY_ORDER.get(cfg.min_severity, 3)
    alerts: list[AlertEvent] = []

    for f in findings:
        sev_str = f.get("risk_level", "low")
        try:
            sev = AlertSeverity(sev_str)
        except ValueError:
            sev = AlertSeverity.LOW

        if _SEVERITY_ORDER.get(sev, 0) < threshold:
            continue

        alerts.append(
            AlertEvent(
                alert_type=AlertType.VULNERABILITY,
                severity=sev,
                title=f"Security finding: {f.get('issue', 'Unknown')}",
                message=(
                    f"Endpoint {endpoint} has a {sev.value} severity issue: "
                    f"{f.get('issue', 'N/A')}. "
                    f"Recommendation: {f.get('recommendation', 'N/A')}"
                ),
                user_id=user_id,
                metadata={
                    "endpoint": endpoint,
                    "method": f.get("method", "N/A"),
                    "risk_level": sev.value,
                    "recommendation": f.get("recommendation", ""),
                },
            )
        )

    return alerts


# ── Cost-spike rule ──────────────────────────────────────────────────────────


def evaluate_cost_spike(
    *,
    user_id: str,
    cost_inr: float,
    model: str,
    tokens_used: int,
    daily_total_inr: float,
    hourly_rate_inr: float | None = None,
    avg_hourly_rate_inr: float | None = None,
    config: CostSpikeRuleConfig | None = None,
) -> list[AlertEvent]:
    """Evaluate a single LLM usage entry against cost-spike thresholds."""
    cfg = config or CostSpikeRuleConfig()
    alerts: list[AlertEvent] = []

    # 1. Single-entry threshold
    if cost_inr >= cfg.single_entry_threshold_inr:
        alerts.append(
            AlertEvent(
                alert_type=AlertType.COST_SPIKE,
                severity=AlertSeverity.HIGH,
                title=f"High single-call cost ({model})",
                message=(
                    f"A single {model} call cost ₹{cost_inr:.2f} "
                    f"({tokens_used:,} tokens). "
                    f"Threshold: ₹{cfg.single_entry_threshold_inr:.2f}."
                ),
                user_id=user_id,
                metadata={
                    "model": model,
                    "cost_inr": round(cost_inr, 4),
                    "tokens_used": tokens_used,
                    "threshold": cfg.single_entry_threshold_inr,
                },
            )
        )

    # 2. Daily total threshold
    if daily_total_inr >= cfg.daily_threshold_inr:
        alerts.append(
            AlertEvent(
                alert_type=AlertType.COST_SPIKE,
                severity=AlertSeverity.CRITICAL,
                title="Daily LLM spend threshold breached",
                message=(
                    f"Today's LLM spend is ₹{daily_total_inr:.2f} "
                    f"(threshold: ₹{cfg.daily_threshold_inr:.2f})."
                ),
                user_id=user_id,
                metadata={
                    "daily_total_inr": round(daily_total_inr, 4),
                    "threshold": cfg.daily_threshold_inr,
                },
            )
        )

    # 3. Hourly rate anomaly
    if (
        hourly_rate_inr is not None
        and avg_hourly_rate_inr is not None
        and avg_hourly_rate_inr > 0
    ):
        ratio = hourly_rate_inr / avg_hourly_rate_inr
        if ratio >= cfg.hourly_rate_multiplier:
            alerts.append(
                AlertEvent(
                    alert_type=AlertType.COST_SPIKE,
                    severity=AlertSeverity.HIGH,
                    title="LLM cost rate anomaly detected",
                    message=(
                        f"Current hourly rate (₹{hourly_rate_inr:.2f}/hr) is "
                        f"{ratio:.1f}× the 7-day average "
                        f"(₹{avg_hourly_rate_inr:.2f}/hr)."
                    ),
                    user_id=user_id,
                    metadata={
                        "hourly_rate_inr": round(hourly_rate_inr, 4),
                        "avg_hourly_rate_inr": round(avg_hourly_rate_inr, 4),
                        "multiplier": round(ratio, 2),
                    },
                )
            )

    return alerts
