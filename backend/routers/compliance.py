from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from services.auth_guard import assert_same_user, get_current_user_id
from services.compliance import generate_compliance_report
from services.supabase_client import supabase

router = APIRouter(tags=["compliance"])

PCI_DEFAULTS = [
    "Firewall Configuration",
    "No Default Passwords",
    "Cardholder Data Protection",
    "Encrypted Transmission",
    "Antivirus/Malware Protection",
    "Secure Systems and Applications",
]


def _evaluate_control(control_name: str, evidence: str) -> tuple[str, str]:
    text = (evidence or "").lower()
    name = control_name.lower()

    if "encrypted transmission" in name or "transmission" in name:
        if "https" in text or "tls" in text or "ssl" in text:
            return "compliant", "Evidence references HTTPS/TLS."
        if text.strip():
            return (
                "partial",
                "Evidence recorded; confirm TLS version and cipher configuration.",
            )
        return (
            "non_compliant",
            "Provide evidence of encrypted transmission (e.g. TLS 1.2+).",
        )

    if "firewall" in name:
        if "waf" in text or "firewall" in text or "security group" in text:
            return (
                "partial",
                "Evidence references perimeter controls; verify rule reviews.",
            )
        return (
            "non_compliant",
            "Document firewall or WAF configuration and change control.",
        )

    if "password" in name or "default" in name:
        if "mfa" in text or "2fa" in text or "sso" in text:
            return (
                "partial",
                "MFA/SSO mentioned; verify no default vendor credentials remain.",
            )
        return (
            "non_compliant",
            "Document password policy, MFA, and default-credential removal.",
        )

    if "cardholder" in name:
        if "token" in text or "vault" in text or "pci" in text:
            return (
                "partial",
                "Evidence suggests tokenization or vaulting; validate scope.",
            )
        return (
            "non_compliant",
            "Map cardholder data flows and storage; minimize retention.",
        )

    if "antivirus" in name or "malware" in name:
        if "edr" in text or "endpoint" in text or "antivirus" in text:
            return (
                "partial",
                "Endpoint protection referenced; confirm coverage and updates.",
            )
        return (
            "non_compliant",
            "Document malware defenses on systems handling sensitive data.",
        )

    if "secure systems" in name or "applications" in name:
        if "patch" in text or "cve" in text or "update" in text:
            return "partial", "Patching mentioned; tie to inventory and SLAs."
        return (
            "non_compliant",
            "Document secure configuration baselines and patch management.",
        )

    if text.strip():
        return "partial", "Evidence captured; manual review recommended."
    return "non_compliant", "Provide specific evidence for this control."


@router.get("/compliance/{user_id}")
def get_compliance(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    res = (
        supabase.table("compliance_checks").select("*").eq("user_id", user_id).execute()
    )
    rows = res.data or []
    if not rows:
        seed = [
            {
                "user_id": user_id,
                "control_name": name,
                "status": "non_compliant",
                "evidence": "",
            }
            for name in PCI_DEFAULTS
        ]
        supabase.table("compliance_checks").insert(seed).execute()
        res2 = (
            supabase.table("compliance_checks")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        rows = res2.data or []
    return {"success": True, "data": {"checks": rows}}


class CheckRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    control_name: str = Field(..., min_length=1)
    evidence: str = ""


@router.post("/compliance/check")
def run_check(req: CheckRequest, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, req.user_id)
    q = (
        supabase.table("compliance_checks")
        .select("*")
        .eq("user_id", req.user_id)
        .eq("control_name", req.control_name)
        .limit(1)
        .execute()
    )
    found = q.data or []
    if not found:
        raise HTTPException(status_code=404, detail="Control not found for user")
    status, note = _evaluate_control(req.control_name, req.evidence)
    merged_evidence = (req.evidence or "").strip()
    if note and merged_evidence:
        merged_evidence = f"{merged_evidence}\n\nAssessor note: {note}"
    elif note:
        merged_evidence = note

    upd = (
        supabase.table("compliance_checks")
        .update({"status": status, "evidence": merged_evidence})
        .eq("user_id", req.user_id)
        .eq("control_name", req.control_name)
        .execute()
    )
    data = upd.data or []
    result = data[0] if data else found[0]
    return {"success": True, "data": result}


# ── Compliance Report (JSON) ──────────────────────────────────────────────────


class ReportRequest(BaseModel):
    organization_name: str = "Your Organization"
    report_type: str = "both"


@router.post("/compliance/report/{user_id}")
def generate_report(
    user_id: str,
    req: ReportRequest,
    auth_user_id: str = Depends(get_current_user_id),
):
    assert_same_user(auth_user_id, user_id)

    # Fetch scan results for this user
    scan_res = (
        supabase.table("scans")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    scan_results: list[dict] = []
    for row in scan_res.data or []:
        issues = row.get("issues") or []
        if isinstance(issues, list):
            scan_results.extend(issues)

    report = generate_compliance_report(
        scan_results=scan_results,
        user_id=user_id,
        organization_name=req.organization_name,
        report_type=req.report_type,
    )
    return {"success": True, "data": report}


# ── Compliance Report (PDF Download) ──────────────────────────────────────────


@router.get("/compliance/report/{user_id}/pdf")
def download_compliance_pdf(
    user_id: str,
    organization: str = "Your Organization",
    report_type: str = "both",
    auth_user_id: str = Depends(get_current_user_id),
):
    """Generate and download a PDF compliance report."""
    assert_same_user(auth_user_id, user_id)

    # Lazy import to avoid import errors if reportlab is not installed
    try:
        from services.pdf_report import generate_compliance_pdf
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PDF generation requires reportlab. Install with: pip install reportlab",
        )

    # Fetch scan results
    scan_res = (
        supabase.table("scans")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    scan_results: list[dict] = []
    for row in scan_res.data or []:
        issues = row.get("issues") or []
        if isinstance(issues, list):
            scan_results.extend(issues)

    report = generate_compliance_report(
        scan_results=scan_results,
        user_id=user_id,
        organization_name=organization,
        report_type=report_type,
    )

    pdf_bytes = generate_compliance_pdf(report)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="devpulse-compliance-{user_id[:8]}.pdf"',
        },
    )


# ── Compliance Mapping Reference ──────────────────────────────────────────────


@router.get("/compliance/mapping/owasp-pci")
def get_owasp_pci_mapping():
    """Return the full OWASP → PCI DSS v4.0.1 mapping dictionary."""
    from services.compliance_mapping import OWASP_PCI_DSS_MAPPING

    return {"success": True, "data": {"mapping": OWASP_PCI_DSS_MAPPING}}


@router.get("/compliance/mapping/owasp-gdpr")
def get_owasp_gdpr_mapping():
    """Return the full OWASP → GDPR mapping dictionary."""
    from services.compliance_mapping import OWASP_GDPR_MAPPING

    return {"success": True, "data": {"mapping": OWASP_GDPR_MAPPING}}


@router.get("/compliance/mapping/gdpr-criteria")
def get_gdpr_criteria():
    """Return the GDPR standalone assessment criteria."""
    from services.compliance_mapping import GDPR_ASSESSMENT_CRITERIA

    return {"success": True, "data": {"criteria": GDPR_ASSESSMENT_CRITERIA}}
