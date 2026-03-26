"""Alert configuration store — manages per-user alert channel configs and rule
thresholds.  Backed by a Supabase table `alert_configs`.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from services.alert_dispatcher import AlertSeverity, ChannelType
from services.supabase_client import supabase

logger = logging.getLogger("alert_config")

_TABLE = "alert_configs"


def _table_exists() -> bool:
    try:
        supabase.table(_TABLE).select("id").limit(1).execute()
        return True
    except Exception:
        return False


# ── CRUD helpers ─────────────────────────────────────────────────────────────


def get_user_config(user_id: str) -> dict[str, Any]:
    """Return the user's alert configuration (creates default if missing)."""
    if not _table_exists():
        logger.warning("alert_configs table missing — returning defaults")
        return _default_config(user_id)

    res = supabase.table(_TABLE).select("*").eq("user_id", user_id).limit(1).execute()
    rows = res.data or []
    if rows:
        return rows[0]

    # Create default row
    defaults = _default_config(user_id)
    supabase.table(_TABLE).insert(defaults).execute()
    return defaults


def upsert_user_config(user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update (or insert) the user's alert config."""
    updates["user_id"] = user_id
    if not _table_exists():
        raise RuntimeError("alert_configs table does not exist")

    existing = (
        supabase.table(_TABLE).select("id").eq("user_id", user_id).limit(1).execute()
    )
    rows = existing.data or []
    if rows:
        supabase.table(_TABLE).update(updates).eq("user_id", user_id).execute()
    else:
        supabase.table(_TABLE).insert(updates).execute()

    return get_user_config(user_id)


def _default_config(user_id: str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "enabled": True,
        "channels": [
            {
                "channel": ChannelType.SLACK.value,
                "enabled": False,
                "slack_webhook_url": "",
            },
            {
                "channel": ChannelType.EMAIL.value,
                "enabled": False,
                "email_to": "",
            },
        ],
        "vulnerability_min_severity": AlertSeverity.HIGH.value,
        "cost_daily_threshold_inr": 500.0,
        "cost_single_entry_threshold_inr": 100.0,
        "cost_hourly_rate_multiplier": 3.0,
    }
