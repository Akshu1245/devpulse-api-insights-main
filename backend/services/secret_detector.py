"""
Secret Detection Engine — DevPulse
Combines regex pattern matching with Shannon entropy analysis
to detect API keys, tokens, passwords, and other sensitive data.

Supports: JWT tokens, AWS keys, GitHub PATs, Stripe keys, OpenAI keys,
          Bearer tokens, Basic auth, generic API keys, passwords, and
          high-entropy strings indicative of secrets.
"""

from __future__ import annotations

import base64
import json
import math
import re
from collections import Counter
from typing import Any

# ─── Shannon Entropy ─────────────────────────────────────────────────────────

ENTROPY_THRESHOLD = 4.5
MIN_ENTROPY_LENGTH = 20


def shannon_entropy(data: str) -> float:
    """Calculate Shannon entropy of a string. Higher = more random = more likely a secret."""
    if not data:
        return 0.0
    counter = Counter(data)
    length = len(data)
    entropy = -sum(
        (count / length) * math.log2(count / length) for count in counter.values()
    )
    return round(entropy, 4)


def _extract_high_entropy_tokens(
    text: str, min_length: int = MIN_ENTROPY_LENGTH
) -> list[dict[str, Any]]:
    """Extract tokens with high Shannon entropy from text."""
    findings = []
    # Split on common delimiters to isolate tokens
    tokens = re.split(r'[\s,;|"\']+', text)
    for token in tokens:
        token = token.strip()
        if len(token) < min_length:
            continue
        # Skip obvious non-secrets (URLs, emails, paths)
        if token.startswith(("http://", "https://", "/", "./")):
            continue
        if "@" in token and "." in token:
            continue
        # Skip Postman variables
        if token.startswith("{{") and token.endswith("}}"):
            continue
        ent = shannon_entropy(token)
        if ent >= ENTROPY_THRESHOLD:
            findings.append(
                {
                    "type": "High-Entropy String",
                    "severity": "high",
                    "detail": f"Token with Shannon entropy {ent:.2f} (threshold: {ENTROPY_THRESHOLD})",
                    "token_preview": token[:8] + "..." + token[-4:]
                    if len(token) > 16
                    else token,
                    "entropy": ent,
                    "length": len(token),
                    "recommendation": "Verify this is not a hardcoded secret. Use environment variables or a secrets manager.",
                }
            )
    return findings


# ─── JWT Detection ────────────────────────────────────────────────────────────

# JWT pattern: three base64url segments separated by dots
JWT_PATTERN = re.compile(
    r"\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-+/=]{10,})\b"
)


def _decode_jwt_payload(token: str) -> dict[str, Any] | None:
    """Attempt to decode the payload of a JWT without verification."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Add padding
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes)
    except Exception:
        return None


def _detect_jwt_tokens(text: str, location: str) -> list[dict[str, Any]]:
    """Detect JWT tokens in text and extract claims if possible."""
    findings = []
    matches = JWT_PATTERN.findall(text)
    for jwt_token in matches:
        payload = _decode_jwt_payload(jwt_token)
        detail = f"JWT token found in {location}"
        if payload:
            sub = payload.get("sub", "unknown")
            exp = payload.get("exp")
            iss = payload.get("iss", "unknown")
            detail += f" (sub={sub}, iss={iss}, exp={exp})"
            if exp is None:
                detail += " WARNING: token has no expiration claim"
        findings.append(
            {
                "type": "JWT Token",
                "severity": "critical",
                "location": location,
                "detail": detail,
                "token_preview": jwt_token[:20] + "...",
                "has_expiration": payload is not None and "exp" in payload,
                "recommendation": "Remove JWT from collection. Use environment variables. Ensure tokens have short expiration times.",
            }
        )
    return findings


# ─── Regex Patterns ───────────────────────────────────────────────────────────

SECRET_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    # (compiled_regex, label, severity)
    (
        re.compile(
            r'(?i)(api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?'
        ),
        "API Key",
        "critical",
    ),
    (
        re.compile(
            r'(?i)(secret[_-]?key|secret[_-]?token|client[_-]?secret)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?'
        ),
        "Secret Key",
        "critical",
    ),
    (
        re.compile(r"(?i)(bearer\s+)([A-Za-z0-9\-._~+/]+=*)"),
        "Bearer Token",
        "critical",
    ),
    (
        re.compile(
            r'(?i)(authorization)\s*[:=]\s*["\']?(Basic\s+[A-Za-z0-9+/=]+)["\']?'
        ),
        "Basic Auth",
        "high",
    ),
    (
        re.compile(r"sk-[A-Za-z0-9]{32,}"),
        "OpenAI API Key",
        "critical",
    ),
    (
        re.compile(r"(?i)(razorpay[_-]?key|rzp_)[A-Za-z0-9_]{16,}"),
        "Razorpay Key",
        "critical",
    ),
    (
        re.compile(r"AKIA[0-9A-Z]{16}"),
        "AWS Access Key ID",
        "critical",
    ),
    (
        re.compile(
            r'(?i)(aws[_-]?secret[_-]?access[_-]?key)\s*[:=]\s*["\']?([A-Za-z0-9/+=]{40})["\']?'
        ),
        "AWS Secret Access Key",
        "critical",
    ),
    (
        re.compile(r"ghp_[A-Za-z0-9]{36}"),
        "GitHub Personal Access Token",
        "critical",
    ),
    (
        re.compile(r"gho_[A-Za-z0-9]{36}"),
        "GitHub OAuth Access Token",
        "critical",
    ),
    (
        re.compile(r"github_pat_[A-Za-z0-9_]{82}"),
        "GitHub Fine-Grained PAT",
        "critical",
    ),
    (
        re.compile(r'(?i)(password|passwd|pwd)\s*[:=]\s*["\']?([^\s"\']{8,})["\']?'),
        "Password",
        "high",
    ),
    (
        re.compile(
            r'(?i)(new[_-]?relic[_-]?key|newrelic)[_-]?\s*[:=]\s*["\']?([A-Za-z0-9_\-]{20,})["\']?'
        ),
        "New Relic Key",
        "high",
    ),
    (
        re.compile(r"sk_live_[A-Za-z0-9]{24,}"),
        "Stripe Live Secret Key",
        "critical",
    ),
    (
        re.compile(r"pk_live_[A-Za-z0-9]{24,}"),
        "Stripe Live Publishable Key",
        "high",
    ),
    (
        re.compile(r"sk_test_[A-Za-z0-9]{24,}"),
        "Stripe Test Secret Key",
        "medium",
    ),
    (
        re.compile(r"(?i)(slack[_-]?token|xox[bpsar]-[A-Za-z0-9\-]+)"),
        "Slack Token",
        "critical",
    ),
    (
        re.compile(
            r"(?i)(sendgrid[_-]?api[_-]?key|SG\.[A-Za-z0-9_\-]{22,}\.[A-Za-z0-9_\-]{22,})"
        ),
        "SendGrid API Key",
        "critical",
    ),
    (
        re.compile(
            r'(?i)(twilio[_-]?(account[_-]?sid|auth[_-]?token))\s*[:=]\s*["\']?([A-Za-z0-9]{16,})["\']?'
        ),
        "Twilio Credentials",
        "critical",
    ),
    (
        re.compile(
            r'(?i)(firebase[_-]?key|firebase[_-]?token)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{20,})["\']?'
        ),
        "Firebase Key",
        "high",
    ),
    (
        re.compile(
            r'(?i)(private[_-]?key|priv[_-]?key)\s*[:=]\s*["\']?([A-Za-z0-9_\-/+=]{32,})["\']?'
        ),
        "Private Key",
        "critical",
    ),
    (
        re.compile(r"-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----"),
        "PEM Private Key",
        "critical",
    ),
    (
        re.compile(
            r'(?i)(database[_-]?url|db[_-]?connection[_-]?string)\s*[:=]\s*["\']?([^\s"\']{20,})["\']?'
        ),
        "Database Connection String",
        "critical",
    ),
]


def _scan_string_with_regex(text: str, location: str) -> list[dict[str, Any]]:
    """Scan a string with all regex patterns and return findings."""
    findings = []
    seen_types = set()
    for pattern, label, severity in SECRET_PATTERNS:
        matches = pattern.findall(text)
        if matches and label not in seen_types:
            seen_types.add(label)
            findings.append(
                {
                    "type": label,
                    "severity": severity,
                    "location": location,
                    "detail": f"Potential {label} found in {location}",
                    "recommendation": f"Remove {label} from collection. Use environment variables instead. Rotate this credential immediately.",
                }
            )
    return findings


# ─── Public API ───────────────────────────────────────────────────────────────


def detect_secrets_in_string(text: str, location: str) -> list[dict[str, Any]]:
    """
    Full secret detection pipeline for a single string.
    Combines regex patterns, JWT detection, and Shannon entropy analysis.
    Deduplicates findings by type.
    """
    findings: list[dict[str, Any]] = []

    # Skip if text is empty or just whitespace
    if not text or not text.strip():
        return findings

    # 1. Regex pattern matching
    findings.extend(_scan_string_with_regex(text, location))

    # 2. JWT token detection
    findings.extend(_detect_jwt_tokens(text, location))

    # 3. Shannon entropy analysis (only on segments not already flagged)
    entropy_findings = _extract_high_entropy_tokens(text)
    for ef in entropy_findings:
        ef["location"] = location
    # Only add entropy findings if no regex pattern already caught the same token
    regex_types = {f["type"] for f in findings}
    for ef in entropy_findings:
        if ef["type"] not in regex_types:
            findings.append(ef)

    return findings


def detect_secrets_in_headers(
    headers: list[dict], location: str
) -> list[dict[str, Any]]:
    """Detect secrets in HTTP headers (key-value pairs)."""
    findings = []
    for h in headers:
        key = str(h.get("key", ""))
        value = str(h.get("value", ""))
        combined = f"{key}: {value}"
        findings.extend(
            detect_secrets_in_string(combined, f"{location} > header '{key}'")
        )
    return findings


def detect_secrets_in_body(body: dict, location: str) -> list[dict[str, Any]]:
    """Detect secrets in request body (raw, urlencoded, form-data, graphql)."""
    findings = []
    if not body:
        return findings

    mode = body.get("mode", "")
    if mode == "raw":
        raw = body.get("raw", "")
        findings.extend(detect_secrets_in_string(raw, f"{location} > body (raw)"))
    elif mode == "urlencoded":
        for param in body.get("urlencoded", []):
            val = f"{param.get('key', '')}={param.get('value', '')}"
            findings.extend(
                detect_secrets_in_string(
                    val, f"{location} > body param '{param.get('key', '')}'"
                )
            )
    elif mode == "formdata":
        for param in body.get("formdata", []):
            val = f"{param.get('key', '')}={param.get('value', '')}"
            findings.extend(
                detect_secrets_in_string(
                    val, f"{location} > form field '{param.get('key', '')}'"
                )
            )
    elif mode == "graphql":
        query = body.get("graphql", {}).get("query", "")
        variables = body.get("graphql", {}).get("variables", "")
        findings.extend(detect_secrets_in_string(query, f"{location} > GraphQL query"))
        findings.extend(
            detect_secrets_in_string(variables, f"{location} > GraphQL variables")
        )

    return findings


def detect_secrets_in_auth(auth: dict, location: str) -> list[dict[str, Any]]:
    """Detect secrets in Postman auth blocks."""
    findings = []
    if not auth:
        return findings
    auth_str = json.dumps(auth)
    findings.extend(detect_secrets_in_string(auth_str, f"{location} > auth"))
    return findings


def deduplicate_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate findings by type+location."""
    seen = set()
    unique = []
    for f in findings:
        key = f"{f.get('type', '')}:{f.get('location', '')}"
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique
