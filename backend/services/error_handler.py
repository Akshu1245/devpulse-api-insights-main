from __future__ import annotations

import contextlib
import logging
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException

_log = logging.getLogger("devpulse")


def structured_error(
    message: str,
    code: str = "ERROR",
    details: dict | None = None,
    status_code: int = 400,
) -> HTTPException:
    """Build a structured HTTPException with {message, code, details}."""
    return HTTPException(
        status_code=status_code,
        detail={
            "message": message,
            "code": code,
            "details": details or {},
        },
    )


def validate_url(raw: str, field_name: str = "endpoint") -> str:
    """Validate and normalize a URL. Raises HTTP 400 on failure."""
    if not raw or not raw.strip():
        raise structured_error(
            message=f"'{field_name}' is required and must not be empty",
            code="INVALID_URL",
            details={"field": field_name},
        )
    url = raw.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise structured_error(
            message=f"'{field_name}' must use http or https scheme",
            code="INVALID_URL",
            details={"field": field_name, "value": raw},
        )
    if not parsed.netloc:
        raise structured_error(
            message=f"'{field_name}' is not a valid URL (missing host)",
            code="INVALID_URL",
            details={"field": field_name, "value": raw},
        )
    return url


def validate_postman_collection(collection: Any) -> None:
    """Validate Postman Collection v2.x structure. Raises HTTP 400 on failure."""
    if not isinstance(collection, dict):
        raise structured_error(
            message="Postman collection must be a JSON object",
            code="INVALID_POSTMAN_COLLECTION",
        )
    info = collection.get("info")
    if not isinstance(info, dict) or not info.get("name"):
        raise structured_error(
            message="Postman collection must have an info.name field",
            code="INVALID_POSTMAN_COLLECTION",
            details={"hint": "Ensure you are uploading a valid Postman Collection v2.x JSON"},
        )
    if "item" not in collection:
        raise structured_error(
            message="Postman collection must have an item array",
            code="INVALID_POSTMAN_COLLECTION",
            details={"hint": "Export the collection from Postman as Collection v2.1"},
        )


def safe_db_call(operation_name: str):
    """Context manager that wraps Supabase calls. Raises HTTP 503 on DB failure."""
    @contextlib.contextmanager
    def _ctx():
        try:
            yield
        except HTTPException:
            raise
        except Exception as exc:
            _log.error("DB operation %r failed: %s", operation_name, exc, exc_info=True)
            raise HTTPException(
                status_code=503,
                detail={
                    "message": "Database operation failed. Please try again.",
                    "code": "DB_ERROR",
                    "details": {},
                },
            ) from exc
    return _ctx()


def log_route_error(
    route: str,
    error: Exception,
    context: dict | None = None,
) -> None:
    """Log a route error with context. Never exposes internals to the caller."""
    _log.error(
        "Route error [%s]: %s - %s | context=%s",
        route,
        type(error).__name__,
        error,
        context or {},
        exc_info=True,
    )
