"""
Kill Switch Router — DevPulse Agent Safety System
Exposes REST endpoints for:
  - Recording LLM calls (cost + thinking overhead check)
  - Querying agent safety status
  - Manually tripping / releasing the kill switch
  - Managing blocked API keys
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any

from services.auth_guard import assert_same_user, get_current_user_id
from services.kill_switch import KillSwitchEvent, TripReason, get_engine

router = APIRouter(prefix="/kill-switch", tags=["kill-switch"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class RecordRequestBody(BaseModel):
    """Record a single HTTP request from an agent for rate/loop detection."""

    user_id: str
    agent_id: str
    endpoint: str = Field(
        ..., description="The API endpoint path being called, e.g. /api/scan"
    )


class RecordLLMCallBody(BaseModel):
    """Record an LLM call for cost-velocity detection."""

    user_id: str
    agent_id: str
    cost_inr: float = Field(..., ge=0)
    thinking_overhead_multiplier: float = Field(default=1.0, ge=0)
    model: str = ""


class ManualKillBody(BaseModel):
    """Manually trip the kill switch for an agent."""

    user_id: str
    agent_id: str
    reason: str = "Manually triggered by operator"


class BlockApiKeyBody(BaseModel):
    """Block or unblock an API key by its identifier."""

    api_key_id: str


class KillSwitchTripResponse(BaseModel):
    tripped: bool
    agent_id: str
    reason: str | None = None
    detail: str | None = None
    auto_release_at: str | None = None
    message: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/record-request", response_model=KillSwitchTripResponse)
def record_agent_request(
    body: RecordRequestBody,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Record one HTTP request from an agent.
    Returns a trip response if the rate or loop threshold is breached.
    Call this from your agent wrapper before every API call.
    """
    assert_same_user(auth_user_id, body.user_id)

    engine = get_engine()
    blocked, msg = engine.is_blocked(body.agent_id)
    if blocked:
        return {
            "tripped": True,
            "agent_id": body.agent_id,
            "reason": "already_blocked",
            "detail": msg,
            "message": "Agent is currently blocked by kill switch",
        }

    event = engine.record_request(
        agent_id=body.agent_id,
        user_id=body.user_id,
        endpoint=body.endpoint,
    )
    if event:
        return _event_to_response(event, tripped=True)

    return {
        "tripped": False,
        "agent_id": body.agent_id,
        "message": "Request recorded. Agent is operating within safe limits.",
    }


@router.post("/record-llm-call", response_model=KillSwitchTripResponse)
def record_llm_call(
    body: RecordLLMCallBody,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Record an LLM call's cost and thinking overhead.
    Returns a trip response if any cost threshold is breached.
    Pair with /thinking-tokens/log for full attribution.
    """
    assert_same_user(auth_user_id, body.user_id)

    engine = get_engine()
    blocked, msg = engine.is_blocked(body.agent_id)
    if blocked:
        return {
            "tripped": True,
            "agent_id": body.agent_id,
            "reason": "already_blocked",
            "detail": msg,
            "message": "Agent is currently blocked by kill switch",
        }

    event = engine.record_llm_call(
        agent_id=body.agent_id,
        user_id=body.user_id,
        cost_inr=body.cost_inr,
        thinking_overhead_multiplier=body.thinking_overhead_multiplier,
        model=body.model,
    )
    if event:
        return _event_to_response(event, tripped=True)

    return {
        "tripped": False,
        "agent_id": body.agent_id,
        "message": "LLM call recorded. Cost within safe limits.",
    }


@router.get("/status/{agent_id}")
def get_agent_status(
    agent_id: str,
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Return live safety metrics and block status for an agent."""
    assert_same_user(auth_user_id, user_id)
    return get_engine().get_status(agent_id)


@router.post("/kill")
def manual_kill(
    body: ManualKillBody,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Operator-triggered emergency stop.
    Immediately blocks the agent and dispatches a critical alert.
    """
    assert_same_user(auth_user_id, body.user_id)
    event = get_engine().manual_kill(
        agent_id=body.agent_id,
        user_id=body.user_id,
        reason=body.reason,
    )
    return _event_to_response(event, tripped=True)


@router.post("/release/{agent_id}")
def release_agent(
    agent_id: str,
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Manually release a blocked agent before auto-release time."""
    assert_same_user(auth_user_id, user_id)
    released = get_engine().release(agent_id)
    return {
        "released": released,
        "agent_id": agent_id,
        "message": "Agent released" if released else "Agent was not blocked",
    }


@router.post("/block-api-key")
def block_api_key(
    body: BlockApiKeyBody,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Block an API key from being used by any agent."""
    get_engine().block_api_key(body.api_key_id)
    return {"blocked": True, "api_key_id": body.api_key_id}


@router.post("/unblock-api-key")
def unblock_api_key(
    body: BlockApiKeyBody,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Remove an API key from the blocked set."""
    get_engine().unblock_api_key(body.api_key_id)
    return {"unblocked": True, "api_key_id": body.api_key_id}


@router.get("/api-key-status/{api_key_id}")
def api_key_status(
    api_key_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Check whether an API key is currently blocked."""
    blocked = get_engine().is_api_key_blocked(api_key_id)
    return {"api_key_id": api_key_id, "blocked": blocked}


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------


def _event_to_response(event: KillSwitchEvent, tripped: bool) -> dict[str, Any]:
    return {
        "tripped": tripped,
        "agent_id": event.agent_id,
        "reason": event.reason.value,
        "detail": event.detail,
        "auto_release_at": event.auto_release_at,
        "message": (
            f"Kill switch activated: {event.reason.value.replace('_', ' ')}. "
            f"Agent blocked. {'Auto-releases at ' + event.auto_release_at if event.auto_release_at else 'Manual release required.'}"
        ),
    }
