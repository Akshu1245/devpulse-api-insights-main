"""
PCI DSS v4.0.1 and GDPR Compliance Evidence Generator — DevPulse Patent 4
Automatically generates compliance evidence reports from continuous DAST output.

Patent: NHCE/DEV/2026/004
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

# PCI DSS v4.0.1 Requirements mapped to OWASP API Security Top 10
PCI_DSS_MAPPING = {
    "API1:2023": {  # BOLA
        "pci_requirements": [
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of vulnerabilities",
                "description": "Broken Object Level Authorization (BOLA) vulnerabilities allow attackers to access unauthorized objects. PCI DSS 6.2.4 requires secure coding practices that prevent authorization bypass.",
                "status_if_found": "FAIL",
                "remediation": "Implement object-level authorization checks on every API endpoint. Validate that the authenticated user has permission to access the specific object being requested.",
            },
            {
                "id": "6.3.1",
                "title": "Security vulnerabilities are identified and addressed",
                "description": "BOLA vulnerabilities must be identified through security testing and remediated before deployment.",
                "status_if_found": "FAIL",
                "remediation": "Add automated BOLA testing to CI/CD pipeline. Use DevPulse to scan every pull request.",
            },
        ],
        "gdpr_articles": ["Article 25 - Data Protection by Design", "Article 32 - Security of Processing"],
    },
    "API2:2023": {  # Broken Authentication
        "pci_requirements": [
            {
                "id": "8.2.1",
                "title": "All user IDs and authentication credentials are managed",
                "description": "Broken authentication allows attackers to compromise authentication tokens or exploit implementation flaws.",
                "status_if_found": "FAIL",
                "remediation": "Implement strong authentication mechanisms. Use short-lived tokens. Implement token rotation.",
            },
            {
                "id": "8.3.1",
                "title": "All user access to system components is authenticated",
                "description": "Every API endpoint must require proper authentication.",
                "status_if_found": "FAIL",
                "remediation": "Audit all API endpoints for authentication requirements. Ensure no endpoints are publicly accessible without authentication.",
            },
        ],
        "gdpr_articles": ["Article 32 - Security of Processing"],
    },
    "API8:2023": {  # Security Misconfiguration
        "pci_requirements": [
            {
                "id": "2.2.1",
                "title": "Configuration standards are developed and implemented",
                "description": "Missing security headers (HSTS, CSP, X-Frame-Options) indicate security misconfiguration.",
                "status_if_found": "FAIL",
                "remediation": "Implement security header configuration standards. Add HSTS, CSP, X-Frame-Options, and X-Content-Type-Options to all API responses.",
            },
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of vulnerabilities",
                "description": "Security misconfigurations must be caught during development, not in production.",
                "status_if_found": "FAIL",
                "remediation": "Add security header validation to CI/CD pipeline using DevPulse automated scanning.",
            },
        ],
        "gdpr_articles": ["Article 25 - Data Protection by Design", "Article 32 - Security of Processing"],
    },
    "API9:2023": {  # Improper Inventory Management
        "pci_requirements": [
            {
                "id": "6.3.2",
                "title": "An inventory of bespoke and custom software is maintained",
                "description": "Server and technology disclosure headers reveal inventory information to attackers.",
                "status_if_found": "WARN",
                "remediation": "Remove Server and X-Powered-By headers from all API responses.",
            },
            {
                "id": "12.3.1",
                "title": "Each PCI DSS requirement is managed according to a targeted risk analysis",
                "description": "Technology disclosure must be assessed as part of risk management.",
                "status_if_found": "WARN",
                "remediation": "Document and assess all technology disclosure risks. Implement header removal as standard practice.",
            },
        ],
        "gdpr_articles": ["Article 32 - Security of Processing"],
    },
    "API4:2023": {  # Unrestricted Resource Consumption
        "pci_requirements": [
            {
                "id": "6.4.1",
                "title": "Public-facing web applications are protected against attacks",
                "description": "Unrestricted resource consumption can lead to denial of service affecting payment processing availability.",
                "status_if_found": "FAIL",
                "remediation": "Implement rate limiting on all API endpoints. Set maximum request sizes. Use DevPulse AgentGuard to monitor and limit LLM API consumption.",
            },
        ],
        "gdpr_articles": ["Article 32 - Security of Processing"],
    },
}

# GDPR Article mappings for data protection
GDPR_MAPPING = {
    "data_in_transit": {
        "article": "Article 32(1)(a)",
        "title": "Encryption of personal data",
        "requirement": "Personal data must be encrypted in transit using TLS 1.2 or higher.",
        "check": "https_enforced",
    },
    "access_control": {
        "article": "Article 32(1)(b)",
        "title": "Ongoing confidentiality, integrity, availability",
        "requirement": "Appropriate technical measures to ensure ongoing confidentiality and integrity.",
        "check": "authentication_required",
    },
    "data_minimization": {
        "article": "Article 5(1)(c)",
        "title": "Data minimisation",
        "requirement": "APIs should not expose more data than necessary for the stated purpose.",
        "check": "no_excessive_data_exposure",
    },
}


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

    # Build PCI DSS compliance matrix
    pci_requirements = []
    pci_pass = 0
    pci_fail = 0
    pci_warn = 0

    for owasp_cat, mapping in PCI_DSS_MAPPING.items():
        has_findings = owasp_cat in findings_by_owasp
        for req in mapping["pci_requirements"]:
            if has_findings:
                status = req["status_if_found"]
                evidence = f"DevPulse DAST scan detected {len(findings_by_owasp[owasp_cat])} finding(s) related to {owasp_cat}."
                findings_detail = findings_by_owasp[owasp_cat]
            else:
                status = "PASS"
                evidence = f"DevPulse DAST scan found no violations of this requirement."
                findings_detail = []

            if status == "PASS":
                pci_pass += 1
            elif status == "FAIL":
                pci_fail += 1
            else:
                pci_warn += 1

            pci_requirements.append({
                "requirement_id": req["id"],
                "title": req["title"],
                "description": req["description"],
                "owasp_category": owasp_cat,
                "status": status,
                "evidence": evidence,
                "findings": findings_detail,
                "remediation": req["remediation"],
                "gdpr_articles": mapping.get("gdpr_articles", []),
            })

    # Overall compliance status
    total_pci = pci_pass + pci_fail + pci_warn
    compliance_pct = round((pci_pass / total_pci * 100) if total_pci > 0 else 100, 1)
    
    if pci_fail > 0:
        overall_status = "NON_COMPLIANT"
        overall_message = f"{pci_fail} PCI DSS requirement(s) are failing. Immediate remediation required before payment processing can be certified."
    elif pci_warn > 0:
        overall_status = "PARTIAL_COMPLIANCE"
        overall_message = f"All critical requirements pass but {pci_warn} warning(s) should be addressed."
    else:
        overall_status = "COMPLIANT"
        overall_message = "All scanned PCI DSS requirements pass. Continue regular scanning to maintain compliance."

    # GDPR assessment
    gdpr_checks = []
    https_issues = [f for f in scan_results if "http instead of https" in str(f.get("issue", "")).lower()]
    gdpr_checks.append({
        "article": "Article 32(1)(a)",
        "title": "Encryption of personal data in transit",
        "status": "FAIL" if https_issues else "PASS",
        "evidence": f"HTTP (unencrypted) endpoints detected: {len(https_issues)}" if https_issues else "All endpoints use HTTPS encryption.",
        "remediation": "Enforce HTTPS on all endpoints. Redirect HTTP to HTTPS." if https_issues else None,
    })

    cors_issues = [f for f in scan_results if "open cors" in str(f.get("issue", "")).lower()]
    gdpr_checks.append({
        "article": "Article 32(1)(b)",
        "title": "Ongoing confidentiality and integrity",
        "status": "FAIL" if cors_issues else "PASS",
        "evidence": f"Open CORS policy detected on {len(cors_issues)} endpoint(s)" if cors_issues else "CORS policy is properly restricted.",
        "remediation": "Restrict CORS to known origins. Never use wildcard (*) with credentials." if cors_issues else None,
    })

    return {
        "report_id": f"DEVPULSE-{user_id[:8].upper()}-{now.strftime('%Y%m%d%H%M%S')}",
        "generated_at": now.isoformat(),
        "organization": organization_name,
        "report_type": report_type,
        "scan_summary": {
            "total_findings": len(scan_results),
            "critical": len([f for f in scan_results if f.get("risk_level") == "critical"]),
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
            "overall_status": "FAIL" if any(c["status"] == "FAIL" for c in gdpr_checks) else "PASS",
        },
        "attestation": {
            "tool": "DevPulse API Security Scanner",
            "version": "1.0.0",
            "scan_method": "Continuous DAST (Dynamic Application Security Testing)",
            "note": "This report is generated from automated security scanning. For formal PCI DSS certification, engage a Qualified Security Assessor (QSA). This report provides evidence for your QSA engagement.",
        },
    }


def _map_to_owasp(issue_text: str) -> str:
    """Map issue text to OWASP API Security Top 10 category."""
    lower = issue_text.lower()
    if "http instead of https" in lower or "hsts" in lower or "cors" in lower or "csp" in lower or "x-frame" in lower or "x-content-type" in lower:
        return "API8:2023"
    if "server header" in lower or "x-powered-by" in lower:
        return "API9:2023"
    if "authorization" in lower or "bola" in lower:
        return "API1:2023"
    if "authentication" in lower or "credential" in lower or "api key" in lower:
        return "API2:2023"
    if "rate limit" in lower or "resource" in lower:
        return "API4:2023"
    return "API8:2023"  # Default to misconfiguration
PCI DSS v4.0.1 and GDPR Compliance Evidence Generator — DevPulse Patent 4
Automatically generates compliance evidence reports from continuous DAST output.

Patent: NHCE/DEV/2026/004
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

# PCI DSS v4.0.1 Requirements mapped to OWASP API Security Top 10
PCI_DSS_MAPPING = {
    "API1:2023": {  # BOLA
        "pci_requirements": [
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of vulnerabilities",
                "description": "Broken Object Level Authorization (BOLA) vulnerabilities allow attackers to access unauthorized objects. PCI DSS 6.2.4 requires secure coding practices that prevent authorization bypass.",
                "status_if_found": "FAIL",
                "remediation": "Implement object-level authorization checks on every API endpoint. Validate that the authenticated user has permission to access the specific object being requested.",
            },
            {
                "id": "6.3.1",
                "title": "Security vulnerabilities are identified and addressed",
                "description": "BOLA vulnerabilities must be identified through security testing and remediated before deployment.",
                "status_if_found": "FAIL",
                "remediation": "Add automated BOLA testing to CI/CD pipeline. Use DevPulse to scan every pull request.",
            },
        ],
        "gdpr_articles": ["Article 25 - Data Protection by Design", "Article 32 - Security of Processing"],
    },
    "API2:2023": {  # Broken Authentication
        "pci_requirements": [
            {
                "id": "8.2.1",
                "title": "All user IDs and authentication credentials are managed",
                "description": "Broken authentication allows attackers to compromise authentication tokens or exploit implementation flaws.",
                "status_if_found": "FAIL",
                "remediation": "Implement strong authentication mechanisms. Use short-lived tokens. Implement token rotation.",
            },
            {
                "id": "8.3.1",
                "title": "All user access to system components is authenticated",
                "description": "Every API endpoint must require proper authentication.",
                "status_if_found": "FAIL",
                "remediation": "Audit all API endpoints for authentication requirements. Ensure no endpoints are publicly accessible without authentication.",
            },
        ],
        "gdpr_articles": ["Article 32 - Security of Processing"],
    },
    "API8:2023": {  # Security Misconfiguration
        "pci_requirements": [
            {
                "id": "2.2.1",
                "title": "Configuration standards are developed and implemented",
                "description": "Missing security headers (HSTS, CSP, X-Frame-Options) indicate security misconfiguration.",
                "status_if_found": "FAIL",
                "remediation": "Implement security header configuration standards. Add HSTS, CSP, X-Frame-Options, and X-Content-Type-Options to all API responses.",
            },
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of vulnerabilities",
                "description": "Security misconfigurations must be caught during development, not in production.",
                "status_if_found": "FAIL",
                "remediation": "Add security header validation to CI/CD pipeline using DevPulse automated scanning.",
            },
        ],
        "gdpr_articles": ["Article 25 - Data Protection by Design", "Article 32 - Security of Processing"],
    },
    "API9:2023": {  # Improper Inventory Management
        "pci_requirements": [
            {
                "id": "6.3.2",
                "title": "An inventory of bespoke and custom software is maintained",
                "description": "Server and technology disclosure headers reveal inventory information to attackers.",
                "status_if_found": "WARN",
                "remediation": "Remove Server and X-Powered-By headers from all API responses.",
            },
            {
                "id": "12.3.1",
                "title": "Each PCI DSS requirement is managed according to a targeted risk analysis",
                "description": "Technology disclosure must be assessed as part of risk management.",
                "status_if_found": "WARN",
                "remediation": "Document and assess all technology disclosure risks. Implement header removal as standard practice.",
            },
        ],
        "gdpr_articles": ["Article 32 - Security of Processing"],
    },
    "API4:2023": {  # Unrestricted Resource Consumption
        "pci_requirements": [
            {
                "id": "6.4.1",
                "title": "Public-facing web applications are protected against attacks",
                "description": "Unrestricted resource consumption can lead to denial of service affecting payment processing availability.",
                "status_if_found": "FAIL",
                "remediation": "Implement rate limiting on all API endpoints. Set maximum request sizes. Use DevPulse AgentGuard to monitor and limit LLM API consumption.",
            },
        ],
        "gdpr_articles": ["Article 32 - Security of Processing"],
    },
}

# GDPR Article mappings for data protection
GDPR_MAPPING = {
    "data_in_transit": {
        "article": "Article 32(1)(a)",
        "title": "Encryption of personal data",
        "requirement": "Personal data must be encrypted in transit using TLS 1.2 or higher.",
        "check": "https_enforced",
    },
    "access_control": {
        "article": "Article 32(1)(b)",
        "title": "Ongoing confidentiality, integrity, availability",
        "requirement": "Appropriate technical measures to ensure ongoing confidentiality and integrity.",
        "check": "authentication_required",
    },
    "data_minimization": {
        "article": "Article 5(1)(c)",
        "title": "Data minimisation",
        "requirement": "APIs should not expose more data than necessary for the stated purpose.",
        "check": "no_excessive_data_exposure",
    },
}


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

    # Build PCI DSS compliance matrix
    pci_requirements = []
    pci_pass = 0
    pci_fail = 0
    pci_warn = 0

    for owasp_cat, mapping in PCI_DSS_MAPPING.items():
        has_findings = owasp_cat in findings_by_owasp
        for req in mapping["pci_requirements"]:
            if has_findings:
                status = req["status_if_found"]
                evidence = f"DevPulse DAST scan detected {len(findings_by_owasp[owasp_cat])} finding(s) related to {owasp_cat}."
                findings_detail = findings_by_owasp[owasp_cat]
            else:
                status = "PASS"
                evidence = f"DevPulse DAST scan found no violations of this requirement."
                findings_detail = []

            if status == "PASS":
                pci_pass += 1
            elif status == "FAIL":
                pci_fail += 1
            else:
                pci_warn += 1

            pci_requirements.append({
                "requirement_id": req["id"],
                "title": req["title"],
                "description": req["description"],
                "owasp_category": owasp_cat,
                "status": status,
                "evidence": evidence,
                "findings": findings_detail,
                "remediation": req["remediation"],
                "gdpr_articles": mapping.get("gdpr_articles", []),
            })

    # Overall compliance status
    total_pci = pci_pass + pci_fail + pci_warn
    compliance_pct = round((pci_pass / total_pci * 100) if total_pci > 0 else 100, 1)
    
    if pci_fail > 0:
        overall_status = "NON_COMPLIANT"
        overall_message = f"{pci_fail} PCI DSS requirement(s) are failing. Immediate remediation required before payment processing can be certified."
    elif pci_warn > 0:
        overall_status = "PARTIAL_COMPLIANCE"
        overall_message = f"All critical requirements pass but {pci_warn} warning(s) should be addressed."
    else:
        overall_status = "COMPLIANT"
        overall_message = "All scanned PCI DSS requirements pass. Continue regular scanning to maintain compliance."

    # GDPR assessment
    gdpr_checks = []
    https_issues = [f for f in scan_results if "http instead of https" in str(f.get("issue", "")).lower()]
    gdpr_checks.append({
        "article": "Article 32(1)(a)",
        "title": "Encryption of personal data in transit",
        "status": "FAIL" if https_issues else "PASS",
        "evidence": f"HTTP (unencrypted) endpoints detected: {len(https_issues)}" if https_issues else "All endpoints use HTTPS encryption.",
        "remediation": "Enforce HTTPS on all endpoints. Redirect HTTP to HTTPS." if https_issues else None,
    })

    cors_issues = [f for f in scan_results if "open cors" in str(f.get("issue", "")).lower()]
    gdpr_checks.append({
        "article": "Article 32(1)(b)",
        "title": "Ongoing confidentiality and integrity",
        "status": "FAIL" if cors_issues else "PASS",
        "evidence": f"Open CORS policy detected on {len(cors_issues)} endpoint(s)" if cors_issues else "CORS policy is properly restricted.",
        "remediation": "Restrict CORS to known origins. Never use wildcard (*) with credentials." if cors_issues else None,
    })

    return {
        "report_id": f"DEVPULSE-{user_id[:8].upper()}-{now.strftime('%Y%m%d%H%M%S')}",
        "generated_at": now.isoformat(),
        "organization": organization_name,
        "report_type": report_type,
        "scan_summary": {
            "total_findings": len(scan_results),
            "critical": len([f for f in scan_results if f.get("risk_level") == "critical"]),
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
            "overall_status": "FAIL" if any(c["status"] == "FAIL" for c in gdpr_checks) else "PASS",
        },
        "attestation": {
            "tool": "DevPulse API Security Scanner",
            "version": "1.0.0",
            "scan_method": "Continuous DAST (Dynamic Application Security Testing)",
            "note": "This report is generated from automated security scanning. For formal PCI DSS certification, engage a Qualified Security Assessor (QSA). This report provides evidence for your QSA engagement.",
        },
    }


def _map_to_owasp(issue_text: str) -> str:
    """Map issue text to OWASP API Security Top 10 category."""
    lower = issue_text.lower()
    if "http instead of https" in lower or "hsts" in lower or "cors" in lower or "csp" in lower or "x-frame" in lower or "x-content-type" in lower:
        return "API8:2023"
    if "server header" in lower or "x-powered-by" in lower:
        return "API9:2023"
    if "authorization" in lower or "bola" in lower:
        return "API1:2023"
    if "authentication" in lower or "credential" in lower or "api key" in lower:
        return "API2:2023"
    if "rate limit" in lower or "resource" in lower:
        return "API4:2023"
    return "API8:2023"  # Default to misconfiguration

