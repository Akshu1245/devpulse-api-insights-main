from __future__ import annotations

import os

from fastapi import HTTPException

from services.supabase_client import supabase

_cached_alerts_table: str | None = None


def _table_exists(name: str) -> bool:
    try:
        supabase.table(name).select("id").limit(1).execute()
        return True
    except Exception:
        return False


def get_alerts_table() -> str:
    global _cached_alerts_table
    if _cached_alerts_table:
        return _cached_alerts_table

    preferred = os.getenv("SCANNER_ALERTS_TABLE", "").strip()
    if preferred:
        if _table_exists(preferred):
            _cached_alerts_table = preferred
            return _cached_alerts_table
        raise RuntimeError(f"Configured SCANNER_ALERTS_TABLE='{preferred}' does not exist.")

    for candidate in ("security_alerts", "alerts"):
        if _table_exists(candidate):
            _cached_alerts_table = candidate
            return _cached_alerts_table

    raise HTTPException(
        status_code=500,
        detail="No scanner alerts table found. Expected 'security_alerts' or 'alerts'.",
    )
