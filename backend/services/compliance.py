"""
PCI DSS v4.0.1 and GDPR Compliance Evidence Generator — DevPulse Patent 4
Automatically generates compliance evidence reports from continuous DAST output.

Patent: NHCE/DEV/2026/004
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services.compliance_mapping import (
    GDPR_ASSESSMENT_CRITERIA,
    OWASP_PCI_DSS_MAPPING,
)


def generate_compliance_report(
    scan_results: list[dict[str, Any]],
    user_id: str,
    organization_name: str = "Your Organization",
    report_type: str = "pci_dss",
) -> dict[str, Any]:
    """
    PATENT 4 CORE ALGORITHM: Automated Compliance Evidence Generation

    Generates PCI DSS v4.0.1 and/or GDPR compliance evidence reports
    from continuous DAST scan output.

    Args:
        scan_results: List of security scan findings from DevPulse scanner
        user_id: User ID for the report
        organization_name: Organization name for the report header
        report_type: "pci_dss", "gdpr", or "both"

    Returns:
        Structured compliance report with pass/fail/warn status per requirement
    """
    now = datetime.now(timezone.utc)

    # Categorize findings by OWASP category
    findings_by_owasp: dict[str, list[dict]] = {}
    for finding in scan_results:
        issue = str(finding.get("issue", "")).lower()
        owasp_cat = _map_to_owasp(issue)
        if owasp_cat not in findings_by_owasp:
            findings_by_owasp[owasp_cat] = []
        findings_by_owasp[owasp_cat].append(finding)

    # Build PCI DSS compliance matrix from expanded mapping
    pci_requirements = []
    pci_pass = 0
    pci_fail = 0
    pci_warn = 0

    for owasp_cat, mapping in OWASP_PCI_DSS_MAPPING.items():
        has_findings = owasp_cat in findings_by_owasp
        for req in mapping["pci_requirements"]:
            if has_findings:
                status = req["status_if_found"]
                evidence = (
                    f"DevPulse DAST scan detected "
                    f"{len(findings_by_owasp[owasp_cat])} finding(s) "
                    f"related to {owasp_cat} ({mapping['owasp_name']})."
                )
                findings_detail = findings_by_owasp[owasp_cat]
            else:
                status = "PASS"
                evidence = "DevPulse DAST scan found no violations of this requirement."
                findings_detail = []

            if status == "PASS":
                pci_pass += 1
            elif status == "FAIL":
                pci_fail += 1
            else:
                pci_warn += 1

            pci_requirements.append(
                {
                    "requirement_id": req["id"],
                    "title": req["title"],
                    "description": req["description"],
                    "owasp_category": owasp_cat,
                    "status": status,
                    "evidence": evidence,
                    "findings": findings_detail,
                    "remediation": req["remediation"],
                    "gdpr_articles": mapping.get("gdpr_articles", []),
                }
            )

    # Overall compliance status
    total_pci = pci_pass + pci_fail + pci_warn
    compliance_pct = round((pci_pass / total_pci * 100) if total_pci > 0 else 100, 1)

    if pci_fail > 0:
        overall_status = "NON_COMPLIANT"
        overall_message = (
            f"{pci_fail} PCI DSS requirement(s) are failing. "
            "Immediate remediation required before payment processing can be certified."
        )
    elif pci_warn > 0:
        overall_status = "PARTIAL_COMPLIANCE"
        overall_message = f"All critical requirements pass but {pci_warn} warning(s) should be addressed."
    else:
        overall_status = "COMPLIANT"
        overall_message = "All scanned PCI DSS requirements pass. Continue regular scanning to maintain compliance."

    # GDPR assessment using comprehensive criteria
    gdpr_checks = _build_gdpr_checks(scan_results)

    return {
        "report_id": f"DEVPULSE-{user_id[:8].upper()}-{now.strftime('%Y%m%d%H%M%S')}",
        "generated_at": now.isoformat(),
        "organization": organization_name,
        "report_type": report_type,
        "scan_summary": {
            "total_findings": len(scan_results),
            "critical": len(
                [f for f in scan_results if f.get("risk_level") == "critical"]
            ),
            "high": len([f for f in scan_results if f.get("risk_level") == "high"]),
            "medium": len([f for f in scan_results if f.get("risk_level") == "medium"]),
            "low": len([f for f in scan_results if f.get("risk_level") == "low"]),
        },
        "pci_dss": {
            "version": "4.0.1",
            "effective_date": "March 31, 2025",
            "overall_status": overall_status,
            "overall_message": overall_message,
            "compliance_percentage": compliance_pct,
            "requirements_pass": pci_pass,
            "requirements_fail": pci_fail,
            "requirements_warn": pci_warn,
            "requirements": pci_requirements,
        },
        "gdpr": {
            "regulation": "EU GDPR 2016/679",
            "checks": gdpr_checks,
            "overall_status": (
                "FAIL" if any(c["status"] == "FAIL" for c in gdpr_checks) else "PASS"
            ),
        },
        "attestation": {
            "tool": "DevPulse API Security Scanner",
            "version": "1.0.0",
            "scan_method": "Continuous DAST (Dynamic Application Security Testing)",
            "note": (
                "This report is generated from automated security scanning. "
                "For formal PCI DSS certification, engage a Qualified Security Assessor (QSA). "
                "This report provides evidence for your QSA engagement."
            ),
        },
    }


def _build_gdpr_checks(scan_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build GDPR checks by matching scan findings against assessment criteria."""
    checks: list[dict[str, Any]] = []

    for criterion in GDPR_ASSESSMENT_CRITERIA:
        matched_issues = []
        for finding in scan_results:
            issue_lower = str(finding.get("issue", "")).lower()
            for keyword in criterion.get("check_keywords", []):
                if keyword in issue_lower:
                    matched_issues.append(finding)
                    break

        if matched_issues:
            checks.append(
                {
                    "article": criterion["article"],
                    "title": criterion["title"],
                    "status": "FAIL",
                    "evidence": (
                        f"{len(matched_issues)} finding(s) detected related to "
                        f"'{criterion['title']}': "
                        + "; ".join(
                            f.get("issue", "unknown") for f in matched_issues[:3]
                        )
                    ),
                    "remediation": criterion.get("remediation"),
                }
            )
        else:
            checks.append(
                {
                    "article": criterion["article"],
                    "title": criterion["title"],
                    "status": "PASS",
                    "evidence": f"No violations detected for {criterion['title']}.",
                    "remediation": None,
                }
            )

    return checks


def _map_to_owasp(issue_text: str) -> str:
    """
    Map a scanner issue description to an OWASP API Security Top 10 (2023) category.

    Order matters: more specific patterns are checked before broad ones to avoid
    false category assignments (e.g. "authorization" header check vs BOLA).
    """
    lower = issue_text.lower()

    # ── API9: Inventory Management (technology disclosure) ──────────────────
    # Check before auth so "server header" doesn't match "authorization"
    if any(
        kw in lower
        for kw in [
            "server header",
            "x-powered-by",
            "server version",
            "technology disclosure",
            "version disclosure",
            "powered by",
        ]
    ):
        return "API9:2023"

    # ── API7: SSRF ───────────────────────────────────────────────────────────
    if any(kw in lower for kw in ["ssrf", "request forgery", "open redirect"]):
        return "API7:2023"

    # ── API3: Data exposure / mass assignment ────────────────────────────────
    if any(
        kw in lower
        for kw in [
            "excessive data",
            "data exposure",
            "mass assignment",
            "over-posting",
            "overfetch",
            "sensitive field",
        ]
    ):
        return "API3:2023"

    # ── API1: BOLA ───────────────────────────────────────────────────────────
    if any(
        kw in lower
        for kw in ["bola", "object level auth", "unauthorized access to object"]
    ):
        return "API1:2023"

    # ── API5: BFLA ───────────────────────────────────────────────────────────
    if any(
        kw in lower
        for kw in [
            "bfla",
            "function level auth",
            "admin endpoint",
            "privilege escalation",
            "role bypass",
            "admin access",
        ]
    ):
        return "API5:2023"

    # ── API2: Broken Authentication ──────────────────────────────────────────
    if any(
        kw in lower
        for kw in [
            "authentication",
            "credential",
            "api key",
            "bearer token",
            "jwt",
            "session",
            "login",
            "password",
            "token leak",
        ]
    ):
        return "API2:2023"

    # ── API4: Resource Consumption (rate limiting / DoS) ─────────────────────
    if any(
        kw in lower
        for kw in [
            "rate limit",
            "no rate limit",
            "missing rate limit",
            "throttle",
            "resource consumption",
            "dos",
            "denial of service",
        ]
    ):
        return "API4:2023"

    # ── API6: Business Logic ─────────────────────────────────────────────────
    if any(
        kw in lower
        for kw in [
            "business logic",
            "workflow",
            "automation bypass",
            "bot",
            "scraping",
            "transaction velocity",
        ]
    ):
        return "API6:2023"

    # ── API10: Unsafe third-party consumption ────────────────────────────────
    if any(
        kw in lower
        for kw in [
            "third-party",
            "external api",
            "integration",
            "upstream",
            "vendor api",
        ]
    ):
        return "API10:2023"

    # ── API8: Security Misconfiguration (broad catch-all) ────────────────────
    # Covers: missing headers, CORS, HSTS, CSP, HTTP vs HTTPS, TLS, debug endpoints
    if any(
        kw in lower
        for kw in [
            "http instead of https",
            "hsts",
            "strict-transport",
            "cors",
            "open cors",
            "access-control-allow-origin",
            "content-security-policy",
            "csp",
            "x-frame",
            "x-content-type",
            "referrer-policy",
            "missing header",
            "misconfigur",
            "debug",
            "default credential",
            "tls",
            "ssl",
            "certificate",
        ]
    ):
        return "API8:2023"

    # Default: misconfiguration is the most common scanner catch-all
    return "API8:2023"
