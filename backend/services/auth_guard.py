from __future__ import annotations

from fastapi import Header, HTTPException

from services.supabase_client import supabase


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        user_res = supabase.auth.get_user(token)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    user = getattr(user_res, "user", None)
    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return str(user_id)


def assert_same_user(auth_user_id: str, requested_user_id: str) -> None:
    if auth_user_id != requested_user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user mismatch")
