"""Alert configuration API — CRUD for per-user alert channels and thresholds."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.alert_config import get_user_config, upsert_user_config
from services.alert_config import _default_config
from services.auth_guard import assert_same_user, get_current_user_id

router = APIRouter(prefix="/alerts/config", tags=["alerts-config"])


@router.get("/{user_id}")
def get_config(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    return get_user_config(user_id)


class ChannelInput(BaseModel):
    channel: str = Field(..., pattern="^(email|slack)$")
    enabled: bool = False
    email_to: str | None = None
    slack_webhook_url: str | None = None


class UpdateConfigRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    enabled: bool | None = None
    channels: list[ChannelInput] | None = None
    vulnerability_min_severity: str | None = Field(
        None, pattern="^(critical|high|medium|low|info)$"
    )
    cost_daily_threshold_inr: float | None = Field(None, ge=0)
    cost_single_entry_threshold_inr: float | None = Field(None, ge=0)
    cost_hourly_rate_multiplier: float | None = Field(None, ge=0)


@router.put("/{user_id}")
def update_config(
    user_id: str,
    req: UpdateConfigRequest,
    auth_user_id: str = Depends(get_current_user_id),
):
    assert_same_user(auth_user_id, user_id)
    updates: dict = {}
    if req.enabled is not None:
        updates["enabled"] = req.enabled
    if req.channels is not None:
        updates["channels"] = [c.model_dump() for c in req.channels]
    if req.vulnerability_min_severity is not None:
        updates["vulnerability_min_severity"] = req.vulnerability_min_severity
    if req.cost_daily_threshold_inr is not None:
        updates["cost_daily_threshold_inr"] = req.cost_daily_threshold_inr
    if req.cost_single_entry_threshold_inr is not None:
        updates["cost_single_entry_threshold_inr"] = req.cost_single_entry_threshold_inr
    if req.cost_hourly_rate_multiplier is not None:
        updates["cost_hourly_rate_multiplier"] = req.cost_hourly_rate_multiplier

    if not updates:
        return get_user_config(user_id)

    return upsert_user_config(user_id, updates)


@router.post("/{user_id}/test")
def send_test_alert(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
):
    """Send a test alert through all configured channels."""
    assert_same_user(auth_user_id, user_id)

    from services.alert_dispatcher import (
        AlertEvent,
        AlertSeverity,
        AlertType,
        ChannelConfig,
        dispatch_alert,
    )
    import asyncio

    cfg = get_user_config(user_id)
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Alerts are disabled")

    channels = []
    for ch in cfg.get("channels", []):
        if not ch.get("enabled"):
            continue
        channels.append(
            ChannelConfig(
                channel=ch["channel"],
                enabled=True,
                email_to=ch.get("email_to"),
                slack_webhook_url=ch.get("slack_webhook_url"),
            )
        )

    if not channels:
        raise HTTPException(status_code=400, detail="No channels enabled")

    test_alert = AlertEvent(
        alert_type=AlertType.VULNERABILITY,
        severity=AlertSeverity.INFO,
        title="Test Alert",
        message="This is a test alert from DevPulse. Your alert channels are working!",
        user_id=user_id,
    )

    asyncio.get_event_loop().run_until_complete(dispatch_alert(test_alert, channels))
    return {"status": "sent", "channels": len(channels)}
