from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx

SEVERITY_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def normalize_url(raw: str) -> str:
    u = raw.strip()
    if not u:
        raise ValueError("URL is empty")
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u


@dataclass
class SecurityIssue:
    issue: str
    risk_level: str
    recommendation: str
    methods: set[str] = field(default_factory=set)

    def key(self) -> str:
        return self.issue


def _headers_dict(response: httpx.Response) -> dict[str, str]:
    return {k.lower(): v for k, v in response.headers.items()}


def analyze_response(
    url: str, method: str, response: httpx.Response | None, error: str | None
) -> list[SecurityIssue]:
    issues: list[SecurityIssue] = []
    parsed = urlparse(url)

    if parsed.scheme == "http":
        issues.append(
            SecurityIssue(
                issue="Endpoint uses HTTP instead of HTTPS",
                risk_level="critical",
                recommendation="Serve the API only over HTTPS and redirect HTTP to HTTPS.",
                methods={method},
            )
        )

    if error:
        issues.append(
            SecurityIssue(
                issue=f"Request failed: {error}",
                risk_level="high",
                recommendation="Ensure the URL is reachable, TLS is valid, and the server accepts the HTTP method.",
                methods={method},
            )
        )
        return issues

    assert response is not None
    h = _headers_dict(response)

    if not h.get("x-frame-options"):
        issues.append(
            SecurityIssue(
                issue="Missing X-Frame-Options header",
                risk_level="high",
                recommendation="Set X-Frame-Options: DENY or SAMEORIGIN (or use CSP frame-ancestors).",
                methods={method},
            )
        )

    if not h.get("x-content-type-options"):
        issues.append(
            SecurityIssue(
                issue="Missing X-Content-Type-Options header",
                risk_level="medium",
                recommendation="Set X-Content-Type-Options: nosniff.",
                methods={method},
            )
        )

    if not h.get("strict-transport-security"):
        issues.append(
            SecurityIssue(
                issue="Missing Strict-Transport-Security header",
                risk_level="high",
                recommendation="Enable HSTS with a suitable max-age on HTTPS responses.",
                methods={method},
            )
        )

    csp = h.get("content-security-policy")
    if not csp:
        issues.append(
            SecurityIssue(
                issue="Missing Content-Security-Policy header",
                risk_level="medium",
                recommendation="Define a strict Content-Security-Policy appropriate for your API or documentation pages.",
                methods={method},
            )
        )

    acao = (h.get("access-control-allow-origin") or "").strip()
    if acao == "*":
        issues.append(
            SecurityIssue(
                issue="Open CORS policy (Access-Control-Allow-Origin: *)",
                risk_level="high",
                recommendation="Restrict CORS to known origins instead of wildcard when credentials or sensitive data are involved.",
                methods={method},
            )
        )

    if h.get("server"):
        issues.append(
            SecurityIssue(
                issue="Server header exposes technology information",
                risk_level="low",
                recommendation="Remove or genericize the Server header in production.",
                methods={method},
            )
        )

    if h.get("x-powered-by"):
        issues.append(
            SecurityIssue(
                issue="X-Powered-By header exposes stack information",
                risk_level="low",
                recommendation="Disable X-Powered-By in your application server configuration.",
                methods={method},
            )
        )

    return issues


def merge_issues(by_method: dict[str, list[SecurityIssue]]) -> list[dict[str, Any]]:
    merged: dict[str, SecurityIssue] = {}
    for method, lst in by_method.items():
        for it in lst:
            k = it.key()
            if k not in merged:
                merged[k] = SecurityIssue(
                    issue=it.issue,
                    risk_level=it.risk_level,
                    recommendation=it.recommendation,
                    methods=set(),
                )
            cur = merged[k]
            cur.methods.add(method)
            if SEVERITY_ORDER.get(it.risk_level, 0) > SEVERITY_ORDER.get(
                cur.risk_level, 0
            ):
                cur.risk_level = it.risk_level
                cur.recommendation = it.recommendation

    out: list[dict[str, Any]] = []
    for it in merged.values():
        methods = sorted(it.methods)
        method_label = (
            ",".join(methods)
            if len(methods) > 1
            else (methods[0] if methods else "GET")
        )
        out.append(
            {
                "issue": it.issue,
                "risk_level": it.risk_level,
                "recommendation": it.recommendation,
                "method": method_label,
            }
        )
    return out


async def run_security_probe(url: str) -> list[dict[str, Any]]:
    normalized = normalize_url(url)
    by_method: dict[str, list[SecurityIssue]] = {"GET": [], "POST": []}

    timeout = httpx.Timeout(20.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for method, call in (
            ("GET", lambda: client.get(normalized)),
            ("POST", lambda: client.post(normalized, json={})),
        ):
            try:
                response = await call()
                by_method[method] = analyze_response(normalized, method, response, None)
            except httpx.RequestError as e:
                by_method[method] = analyze_response(normalized, method, None, str(e))

    return merge_issues(by_method)
