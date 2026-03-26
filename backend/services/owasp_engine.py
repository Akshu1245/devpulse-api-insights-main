"""
OWASP API Security Top 10 Scanning Engine
==========================================
Real vulnerability detection through request simulation, response analysis,
and pattern detection. Rule-based architecture with extendable plugin system.

Each vulnerability category maps to a dedicated rule function.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable
from urllib.parse import urlparse, urlencode, urlunparse, parse_qs

import httpx


# ---------------------------------------------------------------------------
# Severity
# ---------------------------------------------------------------------------


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

    @property
    def weight(self) -> int:
        return {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}[self.value]


SEVERITY_ORDER: dict[str, int] = {s.value: s.weight for s in Severity}


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class Finding:
    """Single vulnerability finding."""

    owasp_category: str
    owasp_id: str
    title: str
    severity: str  # Severity enum value
    description: str
    evidence: str
    recommendation: str
    cwe: str = ""
    cvss: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "owasp_category": self.owasp_category,
            "owasp_id": self.owasp_id,
            "title": self.title,
            "severity": self.severity,
            "description": self.description,
            "evidence": self.evidence,
            "recommendation": self.recommendation,
            "cwe": self.cwe,
            "cvss": self.cvss,
        }


@dataclass
class ScanContext:
    """Shared context passed to every rule."""

    target_url: str
    base_url: str
    parsed_url: urlparse  # type: ignore[assignment]
    path_segments: list[str]
    client: httpx.AsyncClient
    findings: list[Finding] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    auth_token: str = ""
    extra_headers: dict[str, str] = field(default_factory=dict)

    def add(self, finding: Finding) -> None:
        self.findings.append(finding)


@dataclass
class ScanResult:
    """Full scan output."""

    target_url: str
    scan_duration_ms: float
    findings: list[Finding]
    summary: dict[str, Any]
    scan_id: str = ""
    timestamp: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_url": self.target_url,
            "scan_id": self.scan_id,
            "timestamp": self.timestamp,
            "scan_duration_ms": round(self.scan_duration_ms, 2),
            "total_findings": len(self.findings),
            "summary": self.summary,
            "findings": [f.to_dict() for f in self.findings],
        }


# ---------------------------------------------------------------------------
# Rule type
# ---------------------------------------------------------------------------

RuleFn = Callable[[ScanContext], Awaitable[None]]

_RULE_REGISTRY: list[RuleFn] = []


def register_rule(fn: RuleFn) -> RuleFn:
    """Decorator to register a scanning rule."""
    _RULE_REGISTRY.append(fn)
    return fn


def get_registered_rules() -> list[RuleFn]:
    return list(_RULE_REGISTRY)


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


async def safe_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    **kwargs: Any,
) -> httpx.Response | None:
    """Fire a request and return response or None on failure."""
    try:
        resp = await client.request(method, url, **kwargs)
        return resp
    except (httpx.RequestError, httpx.HTTPStatusError, Exception):
        return None


def url_replace_path(orig: str, new_path: str) -> str:
    p = urlparse(orig)
    return urlunparse(p._replace(path=new_path))


def url_add_query_param(orig: str, key: str, value: str) -> str:
    p = urlparse(orig)
    qs = parse_qs(p.query)
    qs[key] = [value]
    return urlunparse(p._replace(query=urlencode(qs, doseq=True)))


# ---------------------------------------------------------------------------
# Response analysis helpers
# ---------------------------------------------------------------------------

SENSITIVE_FIELD_PATTERNS = re.compile(
    r"(password|passwd|pwd|secret|token|api_key|apikey|access_token|"
    r"refresh_token|private_key|credit_card|ssn|social_security|"
    r"card_number|cvv|bank_account|routing_number|dob|date_of_birth|"
    r"mother_maiden|security_answer)",
    re.IGNORECASE,
)

PII_PATTERNS = {
    "email": re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
    "phone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ipv4": re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
}

INTERNAL_ERROR_PATTERNS = re.compile(
    r"(traceback|stack trace|debug|internal server error|"
    r"sql syntax|mysql|postgresql|sqlite|mongodb|ORA-\d+|"
    r"pymysql|sqlalchemy|prisma|mongoose|sequelize|TypeORM|"
    r"node_modules|/usr/local|/app/|Exception|Error at)",
    re.IGNORECASE,
)


def detect_sensitive_fields(json_data: Any, prefix: str = "") -> list[str]:
    """Recursively scan JSON for sensitive field names."""
    found: list[str] = []
    if isinstance(json_data, dict):
        for key, val in json_data.items():
            full = f"{prefix}.{key}" if prefix else key
            if SENSITIVE_FIELD_PATTERNS.search(key):
                found.append(full)
            found.extend(detect_sensitive_fields(val, full))
    elif isinstance(json_data, list):
        for item in json_data:
            found.extend(detect_sensitive_fields(item, prefix))
    return found


def detect_pii(text: str) -> list[str]:
    """Detect PII patterns in response text."""
    found = []
    for pii_type, pattern in PII_PATTERNS.items():
        if pattern.search(text):
            found.append(pii_type)
    return found


def detect_internal_errors(text: str) -> list[str]:
    """Detect internal error/stack trace leaks."""
    matches = INTERNAL_ERROR_PATTERNS.findall(text)
    return list(set(matches))


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class OwaspScanner:
    """
    Main OWASP API Security scanner.

    Usage:
        scanner = OwaspScanner()
        result = await scanner.scan("https://api.example.com/users/123")
    """

    def __init__(
        self,
        auth_token: str = "",
        extra_headers: dict[str, str] | None = None,
        timeout: float = 30.0,
    ):
        self.auth_token = auth_token
        self.extra_headers = extra_headers or {}
        self.timeout = timeout

    async def scan(self, url: str) -> ScanResult:
        """Run all registered rules against the target URL."""
        import uuid
        from datetime import datetime, timezone

        normalized = self._normalize_url(url)
        parsed = urlparse(normalized)
        path_segments = [s for s in parsed.path.split("/") if s]

        timeout = httpx.Timeout(self.timeout, connect=10.0)
        headers = dict(self.extra_headers)
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            headers=headers,
            verify=False,
        ) as client:
            ctx = ScanContext(
                target_url=normalized,
                base_url=f"{parsed.scheme}://{parsed.netloc}",
                parsed_url=parsed,
                path_segments=path_segments,
                client=client,
                auth_token=self.auth_token,
                extra_headers=self.extra_headers,
            )

            # Probe the baseline response
            baseline = await safe_request(client, "GET", normalized)
            if baseline is not None:
                ctx.metadata["baseline_status"] = baseline.status_code
                ctx.metadata["baseline_headers"] = dict(baseline.headers)
                try:
                    ctx.metadata["baseline_body"] = baseline.text[:50_000]
                    ctx.metadata["baseline_json"] = baseline.json()
                except Exception:
                    ctx.metadata["baseline_body"] = baseline.text[:50_000]
                    ctx.metadata["baseline_json"] = None
            else:
                ctx.metadata["baseline_status"] = 0
                ctx.metadata["baseline_headers"] = {}
                ctx.metadata["baseline_body"] = ""
                ctx.metadata["baseline_json"] = None

            start = time.monotonic()

            # Run all registered rules concurrently
            rules = get_registered_rules()
            await asyncio.gather(*(rule(ctx) for rule in rules))

            elapsed = (time.monotonic() - start) * 1000

        # Build summary
        severity_counts = {s.value: 0 for s in Severity}
        categories: set[str] = set()
        for f in ctx.findings:
            severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1
            categories.add(f.owasp_category)

        return ScanResult(
            target_url=normalized,
            scan_duration_ms=elapsed,
            findings=ctx.findings,
            summary={
                "severity_counts": severity_counts,
                "owasp_categories_detected": sorted(categories),
                "risk_score": self._calc_risk_score(severity_counts),
            },
            scan_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _normalize_url(url: str) -> str:
        url = url.strip()
        if not url:
            raise ValueError("URL is empty")
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        return url

    @staticmethod
    def _calc_risk_score(counts: dict[str, int]) -> int:
        """0-100 risk score from severity counts."""
        raw = (
            counts.get("CRITICAL", 0) * 25
            + counts.get("HIGH", 0) * 15
            + counts.get("MEDIUM", 0) * 8
            + counts.get("LOW", 0) * 3
        )
        return min(100, raw)


# ---------------------------------------------------------------------------
# Auto-import rules (triggers @register_rule decorators)
# ---------------------------------------------------------------------------


def _load_rules() -> None:
    """Import all rule modules so their decorators fire."""
    from services.owasp_rules import bola  # noqa: F401
    from services.owasp_rules import broken_auth  # noqa: F401
    from services.owasp_rules import data_exposure  # noqa: F401
    from services.owasp_rules import mass_assignment  # noqa: F401
    from services.owasp_rules import misconfiguration  # noqa: F401


_load_rules()
