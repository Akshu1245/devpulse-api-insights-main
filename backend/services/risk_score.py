"""
Unified Risk Score Engine — DevPulse Patent 1 Core Algorithm
Combines API security vulnerability severity with LLM cost anomaly data
to produce a single unified risk score per endpoint.

Patent: NHCE/DEV/2026/001
"""

from __future__ import annotations

from typing import Any

# Severity weights for OWASP vulnerability categories
SEVERITY_WEIGHTS = {
    "critical": 1.0,
    "high": 0.75,
    "medium": 0.5,
    "low": 0.25,
    "info": 0.1,
}

# OWASP API Security Top 10 2023 categories with PCI DSS v4.0.1 mappings
OWASP_CATEGORIES = {
    "BOLA": {
        "name": "Broken Object Level Authorization",
        "owasp_id": "API1:2023",
        "pci_req": ["6.2.4", "6.3.1"],
    },
    "BROKEN_AUTH": {
        "name": "Broken Authentication",
        "owasp_id": "API2:2023",
        "pci_req": ["8.2.1", "8.3.1"],
    },
    "BROKEN_OBJECT_PROPERTY": {
        "name": "Broken Object Property Level Authorization",
        "owasp_id": "API3:2023",
        "pci_req": ["6.2.4"],
    },
    "UNRESTRICTED_RESOURCE": {
        "name": "Unrestricted Resource Consumption",
        "owasp_id": "API4:2023",
        "pci_req": ["6.4.1"],
    },
    "BFLA": {
        "name": "Broken Function Level Authorization",
        "owasp_id": "API5:2023",
        "pci_req": ["6.2.4", "7.1.1"],
    },
    "UNRESTRICTED_ACCESS": {
        "name": "Unrestricted Access to Sensitive Business Flows",
        "owasp_id": "API6:2023",
        "pci_req": ["6.4.2"],
    },
    "SSRF": {
        "name": "Server Side Request Forgery",
        "owasp_id": "API7:2023",
        "pci_req": ["6.2.4"],
    },
    "SECURITY_MISCONFIGURATION": {
        "name": "Security Misconfiguration",
        "owasp_id": "API8:2023",
        "pci_req": ["2.2.1", "6.2.4"],
    },
    "IMPROPER_INVENTORY": {
        "name": "Improper Inventory Management",
        "owasp_id": "API9:2023",
        "pci_req": ["6.3.2", "12.3.1"],
    },
    "UNSAFE_API_CONSUMPTION": {
        "name": "Unsafe Consumption of APIs",
        "owasp_id": "API10:2023",
        "pci_req": ["6.2.4"],
    },
}

# Map scanner issue strings to OWASP categories
ISSUE_TO_OWASP = {
    "http instead of https": "SECURITY_MISCONFIGURATION",
    "missing x-frame-options": "SECURITY_MISCONFIGURATION",
    "missing x-content-type-options": "SECURITY_MISCONFIGURATION",
    "missing strict-transport-security": "SECURITY_MISCONFIGURATION",
    "missing content-security-policy": "SECURITY_MISCONFIGURATION",
    "open cors policy": "SECURITY_MISCONFIGURATION",
    "server header exposes": "IMPROPER_INVENTORY",
    "x-powered-by header": "IMPROPER_INVENTORY",
    "credential": "BROKEN_AUTH",
    "api key": "BROKEN_AUTH",
    "bearer token": "BROKEN_AUTH",
    "authentication": "BROKEN_AUTH",
    "authorization": "BOLA",
    "rate limit": "UNRESTRICTED_RESOURCE",
    "ssrf": "SSRF",
}


def _map_issue_to_owasp(issue_text: str) -> str:
    """Map a scanner issue description to an OWASP category."""
    lower = issue_text.lower()
    for keyword, category in ISSUE_TO_OWASP.items():
        if keyword in lower:
            return category
    return "SECURITY_MISCONFIGURATION"


def calculate_security_score(vulnerabilities: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Calculate a normalized security score (0-100) from vulnerability findings.
    Higher score = more secure (fewer/lower severity issues).
    """
    if not vulnerabilities:
        return {
            "score": 100,
            "grade": "A",
            "vulnerability_count": 0,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
            "owasp_categories": [],
        }

    total_weight = 0.0
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    owasp_hits = set()

    for vuln in vulnerabilities:
        severity = str(vuln.get("risk_level", "low")).lower()
        weight = SEVERITY_WEIGHTS.get(severity, 0.1)
        total_weight += weight
        counts[severity] = counts.get(severity, 0) + 1

        issue_text = str(vuln.get("issue", ""))
        owasp_cat = _map_issue_to_owasp(issue_text)
        owasp_hits.add(owasp_cat)

    max_weight = max(10.0, total_weight)
    raw_score = max(0.0, 100.0 - (total_weight / max_weight * 100.0))
    score = round(raw_score, 1)

    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    owasp_categories = [
        {
            "id": cat,
            "name": OWASP_CATEGORIES[cat]["name"],
            "owasp_id": OWASP_CATEGORIES[cat]["owasp_id"],
        }
        for cat in owasp_hits
        if cat in OWASP_CATEGORIES
    ]

    return {
        "score": score,
        "grade": grade,
        "vulnerability_count": len(vulnerabilities),
        "critical_count": counts.get("critical", 0),
        "high_count": counts.get("high", 0),
        "medium_count": counts.get("medium", 0),
        "low_count": counts.get("low", 0),
        "owasp_categories": owasp_categories,
    }


def calculate_cost_anomaly_score(
    endpoint_cost_inr: float,
    avg_cost_inr: float,
    total_cost_inr: float,
    total_endpoints: int,
) -> dict[str, Any]:
    """
    Calculate a cost anomaly score for an endpoint.
    Returns anomaly ratio and whether this endpoint is a cost outlier.
    """
    if total_cost_inr <= 0 or total_endpoints <= 0:
        return {
            "anomaly_ratio": 0.0,
            "cost_share_pct": 0.0,
            "is_anomaly": False,
            "anomaly_level": "normal",
        }

    expected_share = 1.0 / total_endpoints
    actual_share = endpoint_cost_inr / total_cost_inr if total_cost_inr > 0 else 0.0
    anomaly_ratio = actual_share / expected_share if expected_share > 0 else 0.0

    if anomaly_ratio >= 5.0:
        anomaly_level = "critical"
        is_anomaly = True
    elif anomaly_ratio >= 3.0:
        anomaly_level = "high"
        is_anomaly = True
    elif anomaly_ratio >= 2.0:
        anomaly_level = "medium"
        is_anomaly = True
    elif anomaly_ratio >= 1.5:
        anomaly_level = "low"
        is_anomaly = True
    else:
        anomaly_level = "normal"
        is_anomaly = False

    return {
        "anomaly_ratio": round(anomaly_ratio, 2),
        "cost_share_pct": round(actual_share * 100, 1),
        "is_anomaly": is_anomaly,
        "anomaly_level": anomaly_level,
    }


def calculate_unified_risk_score(
    security_vulnerabilities: list[dict[str, Any]],
    endpoint_cost_inr: float = 0.0,
    avg_cost_inr: float = 0.0,
    total_cost_inr: float = 0.0,
    total_endpoints: int = 1,
    security_weight: float = 0.6,
    cost_weight: float = 0.4,
) -> dict[str, Any]:
    """
    PATENT 1 CORE ALGORITHM: Unified Risk Score

    Combines security vulnerability severity with LLM cost anomaly data
    to produce a single unified risk score per endpoint.

    Formula: unified_risk = (security_weight * security_risk) + (cost_weight * cost_risk)
    Where:
      - security_risk = (100 - security_score) / 100  [0=safe, 1=critical]
      - cost_risk = min(anomaly_ratio / 5.0, 1.0)     [0=normal, 1=extreme anomaly]

    Returns unified_risk_score in [0, 100] where 100 = maximum risk.
    """
    sec = calculate_security_score(security_vulnerabilities)
    cost = calculate_cost_anomaly_score(
        endpoint_cost_inr, avg_cost_inr, total_cost_inr, total_endpoints
    )

    security_risk = (100.0 - sec["score"]) / 100.0
    cost_risk = min(cost["anomaly_ratio"] / 5.0, 1.0)

    unified_risk = (security_weight * security_risk + cost_weight * cost_risk) * 100.0
    unified_risk = round(min(100.0, max(0.0, unified_risk)), 1)

    if unified_risk >= 75:
        risk_level = "critical"
        action = "Immediate remediation required. This endpoint poses critical security and cost risk."
    elif unified_risk >= 50:
        risk_level = "high"
        action = "High priority fix needed. Address security vulnerabilities and investigate cost anomaly."
    elif unified_risk >= 25:
        risk_level = "medium"
        action = "Schedule remediation within sprint. Monitor cost trends."
    elif unified_risk >= 10:
        risk_level = "low"
        action = "Low risk. Address in next maintenance cycle."
    else:
        risk_level = "minimal"
        action = "Endpoint is healthy. Continue monitoring."

    return {
        "unified_risk_score": unified_risk,
        "risk_level": risk_level,
        "action_required": action,
        "security": sec,
        "cost_anomaly": cost,
        "weights_used": {
            "security": security_weight,
            "cost": cost_weight,
        },
        "breakdown": {
            "security_contribution": round(security_weight * security_risk * 100, 1),
            "cost_contribution": round(cost_weight * cost_risk * 100, 1),
        },
    }


# ---------------------------------------------------------------------------
# Direct Scoring Engine — 0-10 inputs → 0-100 normalized output
# ---------------------------------------------------------------------------

# Default weight configuration
DEFAULT_WEIGHTS = {
    "security": 0.6,
    "cost": 0.4,
}

# Risk category thresholds (on 0-100 scale)
RISK_THRESHOLDS = {
    "CRITICAL": 75,
    "DANGER": 50,
    "WARNING": 25,
    "SAFE": 0,
}


def calculate_risk_score(
    security_severity: float,
    cost_anomaly_score: float,
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Unified risk scoring engine.

    Combines security severity and cost anomaly scores into a single
    normalized risk score on a 0-100 scale.

    Args:
        security_severity: Security risk on a 0-10 scale (0=safe, 10=critical).
        cost_anomaly_score: Cost anomaly on a 0-10 scale (0=normal, 10=extreme).
        weights: Optional dict with "security" and "cost" keys (must sum to 1.0).
                 Defaults to {"security": 0.6, "cost": 0.4}.

    Returns:
        Dict with:
            - combined_score (float): 0-100 normalized risk score.
            - category (str): One of SAFE, WARNING, DANGER, CRITICAL.
            - inputs (dict): Echoed input values.
            - weights_used (dict): Weights applied.
            - breakdown (dict): Per-factor contribution to the final score.

    Examples:
        >>> calculate_risk_score(2.0, 1.0)
        {'combined_score': 16.0, 'category': 'WARNING', ...}

        >>> calculate_risk_score(9.0, 8.0, {"security": 0.7, "cost": 0.3})
        {'combined_score': 87.0, 'category': 'CRITICAL', ...}
    """
    if weights is None:
        weights = dict(DEFAULT_WEIGHTS)

    w1 = weights.get("security", DEFAULT_WEIGHTS["security"])
    w2 = weights.get("cost", DEFAULT_WEIGHTS["cost"])

    # Validate inputs
    if not (0.0 <= security_severity <= 10.0):
        raise ValueError(f"security_severity must be 0-10, got {security_severity}")
    if not (0.0 <= cost_anomaly_score <= 10.0):
        raise ValueError(f"cost_anomaly_score must be 0-10, got {cost_anomaly_score}")

    total = w1 + w2
    if total <= 0:
        raise ValueError("Weight sum must be positive")
    # Normalize weights to sum to 1.0
    w1_norm = w1 / total
    w2_norm = w2 / total

    # Core formula: combined = (w1 * security) + (w2 * cost)
    # Inputs are 0-10, output scaled to 0-100
    combined_score = (w1_norm * security_severity + w2_norm * cost_anomaly_score) * 10.0
    combined_score = round(min(100.0, max(0.0, combined_score)), 1)

    # Categorize
    if combined_score >= RISK_THRESHOLDS["CRITICAL"]:
        category = "CRITICAL"
    elif combined_score >= RISK_THRESHOLDS["DANGER"]:
        category = "DANGER"
    elif combined_score >= RISK_THRESHOLDS["WARNING"]:
        category = "WARNING"
    else:
        category = "SAFE"

    return {
        "combined_score": combined_score,
        "category": category,
        "inputs": {
            "security_severity": security_severity,
            "cost_anomaly_score": cost_anomaly_score,
        },
        "weights_used": {
            "security": w1_norm,
            "cost": w2_norm,
        },
        "breakdown": {
            "security_contribution": round(w1_norm * security_severity * 10.0, 1),
            "cost_contribution": round(w2_norm * cost_anomaly_score * 10.0, 1),
        },
    }
