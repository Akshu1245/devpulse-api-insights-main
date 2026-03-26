"""
Compliance Report Sample Generator — DevPulse Patent 4
Demonstrates the full compliance pipeline:
  1. OWASP -> PCI DSS v4.0.1 + GDPR mapping
  2. Structured JSON report from realistic scanner findings
  3. PDF generation (saved to devpulse_compliance_sample.pdf)

Run:
    python sample_compliance_report.py
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from services.compliance import generate_compliance_report
from services.compliance_mapping import (
    OWASP_GDPR_MAPPING,
    OWASP_PCI_DSS_MAPPING,
    get_all_gdpr_articles,
    get_all_pci_requirements,
)

# ---------------------------------------------------------------------------
# Realistic scanner findings dataset
# 14 findings across 7 OWASP categories
# ---------------------------------------------------------------------------

SAMPLE_SCAN_RESULTS = [
    # ── API8: Security Misconfiguration ─────────────────────────────────────
    {
        "issue": "HTTP instead of HTTPS detected",
        "risk_level": "critical",
        "recommendation": "Enforce HTTPS with HSTS. Redirect all HTTP traffic to HTTPS.",
        "endpoint": "/api/v1/payments",
    },
    {
        "issue": "Missing Strict-Transport-Security header",
        "risk_level": "high",
        "recommendation": "Add Strict-Transport-Security: max-age=31536000; includeSubDomains",
        "endpoint": "/api/v1/users",
    },
    {
        "issue": "Missing X-Frame-Options header",
        "risk_level": "medium",
        "recommendation": "Set X-Frame-Options: DENY to prevent clickjacking.",
        "endpoint": "/api/v1/dashboard",
    },
    {
        "issue": "Open CORS policy (Access-Control-Allow-Origin: *)",
        "risk_level": "high",
        "recommendation": "Restrict CORS to specific trusted origins. Remove wildcard.",
        "endpoint": "/api/v1/data",
    },
    {
        "issue": "Missing Content-Security-Policy header",
        "risk_level": "medium",
        "recommendation": "Implement a strict Content-Security-Policy to prevent XSS.",
        "endpoint": "/api/v1/reports",
    },
    # ── API9: Inventory Management (server disclosure) ───────────────────────
    {
        "issue": "Server header exposes version: nginx/1.18.0",
        "risk_level": "low",
        "recommendation": "Remove or obscure Server header in nginx configuration.",
        "endpoint": "/api/v1/health",
    },
    {
        "issue": "X-Powered-By header exposes: Express 4.18.2",
        "risk_level": "low",
        "recommendation": "Remove X-Powered-By header via app.disable('x-powered-by').",
        "endpoint": "/api/v1/auth",
    },
    # ── API2: Broken Authentication ──────────────────────────────────────────
    {
        "issue": "API key transmitted in URL query parameter",
        "risk_level": "critical",
        "recommendation": "Move API keys to Authorization header. Never include secrets in URLs.",
        "endpoint": "/api/v1/external?api_key=sk-abc123",
    },
    {
        "issue": "Bearer token accepted over HTTP (unencrypted)",
        "risk_level": "critical",
        "recommendation": "Reject authentication over plaintext HTTP. Enforce HTTPS for all auth.",
        "endpoint": "/api/v1/auth/token",
    },
    # ── API4: Resource Consumption ───────────────────────────────────────────
    {
        "issue": "Missing rate limiting on authentication endpoint",
        "risk_level": "high",
        "recommendation": "Implement rate limiting: max 5 auth attempts per 15 minutes per IP.",
        "endpoint": "/api/v1/auth/login",
    },
    # ── API1: BOLA ───────────────────────────────────────────────────────────
    {
        "issue": "Unauthorized access to object detected via BOLA test",
        "risk_level": "critical",
        "recommendation": "Validate resource ownership on every GET/PATCH/DELETE by object ID.",
        "endpoint": "/api/v1/users/{id}/profile",
    },
    # ── API7: SSRF ───────────────────────────────────────────────────────────
    {
        "issue": "SSRF: user-controlled URL parameter fetched without validation",
        "risk_level": "high",
        "recommendation": "Validate and allowlist URLs. Block internal IP ranges.",
        "endpoint": "/api/v1/fetch?url=",
    },
    # ── API3: Data Exposure ──────────────────────────────────────────────────
    {
        "issue": "Excessive data exposure: full user object returned including password hash",
        "risk_level": "high",
        "recommendation": "Use DTOs. Strip sensitive fields (password, internal_id) from responses.",
        "endpoint": "/api/v1/users/me",
    },
    # ── API5: BFLA ───────────────────────────────────────────────────────────
    {
        "issue": "Admin endpoint accessible without admin role verification",
        "risk_level": "critical",
        "recommendation": "Enforce role-based authorization on all /admin/* routes.",
        "endpoint": "/api/v1/admin/users",
    },
]


# ---------------------------------------------------------------------------
# 1. Print the mapping dictionary (human-readable)
# ---------------------------------------------------------------------------


def print_mapping_summary() -> None:
    print("=" * 72)
    print("OWASP API Security Top 10 (2023) => Compliance Mapping")
    print("=" * 72)

    print("\n--- PCI DSS v4.0.1 Requirements per OWASP Category ---\n")
    for owasp_id, mapping in OWASP_PCI_DSS_MAPPING.items():
        pci_ids = [r["id"] for r in mapping["pci_requirements"]]
        gdpr_refs = [a.split(" --")[0] for a in mapping.get("gdpr_articles", [])]
        print(f"  {owasp_id:12s}  {mapping['owasp_name']}")
        print(f"    PCI DSS : {', '.join(pci_ids)}")
        print(f"    GDPR    : {', '.join(gdpr_refs)}")
        print()

    total_pci = get_all_pci_requirements()
    total_gdpr = get_all_gdpr_articles()
    print(f"  Total unique PCI DSS requirements mapped : {len(total_pci)}")
    print(f"  Total unique GDPR articles mapped        : {len(total_gdpr)}")


# ---------------------------------------------------------------------------
# 2. Generate structured JSON report
# ---------------------------------------------------------------------------


def generate_and_print_report() -> dict:
    print("\n" + "=" * 72)
    print("Structured Compliance Report (JSON)")
    print("=" * 72)

    report = generate_compliance_report(
        scan_results=SAMPLE_SCAN_RESULTS,
        user_id="demo-user-00000001",
        organization_name="ACME Payments Ltd.",
        report_type="both",
    )

    # Print summary only (full JSON is large)
    pci = report["pci_dss"]
    gdpr = report["gdpr"]
    scan = report["scan_summary"]

    print(f"\n  Report ID   : {report['report_id']}")
    print(f"  Generated   : {report['generated_at']}")
    print(f"  Org         : {report['organization']}")

    print(f"\n  --- Scan Summary ---")
    print(f"  Total Findings : {scan['total_findings']}")
    print(f"  Critical       : {scan['critical']}")
    print(f"  High           : {scan['high']}")
    print(f"  Medium         : {scan['medium']}")
    print(f"  Low            : {scan['low']}")

    print(f"\n  --- PCI DSS v{pci['version']} ---")
    print(f"  Overall Status   : {pci['overall_status']}")
    print(f"  Compliance       : {pci['compliance_percentage']}%")
    print(
        f"  Requirements     : PASS={pci['requirements_pass']}  FAIL={pci['requirements_fail']}  WARN={pci['requirements_warn']}"
    )
    print(f"  Message          : {pci['overall_message']}")

    print(f"\n  --- GDPR Status ---")
    print(f"  Overall   : {gdpr['overall_status']}")
    gdpr_fails = [c for c in gdpr["checks"] if c["status"] == "FAIL"]
    gdpr_pass = [c for c in gdpr["checks"] if c["status"] == "PASS"]
    print(f"  Checks    : {len(gdpr_pass)} PASS / {len(gdpr_fails)} FAIL")
    if gdpr_fails:
        print(f"\n  GDPR Failures:")
        for c in gdpr_fails:
            print(f"    [{c['article']}] {c['title']}")
            print(f"      Evidence    : {c['evidence'][:80]}...")
            print(f"      Remediation : {c['remediation']}")

    print(f"\n  --- Top Failing PCI Requirements ---")
    failing = [r for r in pci["requirements"] if r["status"] == "FAIL"]
    for r in failing[:5]:
        print(f"    [{r['requirement_id']}] {r['title']}")
        print(f"      OWASP : {r['owasp_category']}")
        print(f"      Issue : {r['evidence'][:70]}...")
        print(f"      Fix   : {r['remediation'][:80]}...")
        print()

    return report


# ---------------------------------------------------------------------------
# 3. Generate PDF report
# ---------------------------------------------------------------------------


def generate_pdf(report: dict) -> None:
    print("=" * 72)
    print("PDF Report Generation")
    print("=" * 72)

    try:
        from services.pdf_report import generate_compliance_pdf
    except ImportError:
        print("  [SKIP] reportlab not installed. Run: pip install reportlab")
        return

    try:
        pdf_bytes = generate_compliance_pdf(report)
        out_path = os.path.join(
            os.path.dirname(__file__), "devpulse_compliance_sample.pdf"
        )
        with open(out_path, "wb") as f:
            f.write(pdf_bytes)
        size_kb = round(len(pdf_bytes) / 1024, 1)
        print(f"\n  PDF generated : {out_path}")
        print(f"  File size     : {size_kb} KB")
        print(
            f"  Pages         : ~5 (title, exec summary, PCI detail, GDPR, cross-ref)"
        )
        print(f"\n  PDF Structure:")
        print(f"    Page 1 : Title page + report metadata")
        print(f"    Page 2 : Executive summary + scan metrics table")
        print(
            f"    Page 3 : PCI DSS v4.0.1 requirements detail (PASS/FAIL/WARN per req)"
        )
        print(f"    Page 4 : GDPR Article assessment")
        print(f"    Page 5 : OWASP -> Regulation cross-reference matrix + attestation")
        print(f"\n  Each requirement section contains:")
        print(f"    - Requirement ID and title")
        print(f"    - OWASP category mapping")
        print(f"    - PASS / FAIL / WARN status badge")
        print(f"    - Evidence from DAST scan findings")
        print(f"    - Specific remediation recommendation")
        print(f"    - Cross-referenced GDPR articles")
    except Exception as e:
        print(f"  [ERROR] PDF generation failed: {e}")
        raise


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print_mapping_summary()
    report = generate_and_print_report()

    # Save full JSON report
    json_path = os.path.join(
        os.path.dirname(__file__), "devpulse_compliance_sample.json"
    )
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"\n  Full JSON report saved to: {json_path}")

    generate_pdf(report)
    print("\nDone.")


if __name__ == "__main__":
    main()
