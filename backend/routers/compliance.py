from fastapi import Response
from services.pci_report import generate_pci_report

# PCI DSS PDF Report Route (Patent Claim 4)
from typing import List, Dict
from pydantic import BaseModel

class Finding(BaseModel):
    endpoint: str
    severity: str
    owasp_id: str
    description: str
    remediation: str
    pci_dss_ids: List[str]

class ScanMetadata(BaseModel):
    scan_id: str
    date: str

@router.post("/api/v1/reports/pci/{scan_id}")
async def pci_report(scan_id: str, findings: List[Finding], scan_metadata: ScanMetadata):
    """
    Generates a PCI DSS 4.0 PDF report for a scan.
    Uses patent-credible OWASP→PCI mapping logic.
    """
    pdf_bytes = generate_pci_report([f.dict() for f in findings], scan_metadata.dict())
    return Response(content=pdf_bytes, media_type="application/pdf")
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.auth_guard import assert_same_user, get_current_user_id
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
            return "partial", "Evidence recorded; confirm TLS version and cipher configuration."
        return "non_compliant", "Provide evidence of encrypted transmission (e.g. TLS 1.2+)."

    if "firewall" in name:
        if "waf" in text or "firewall" in text or "security group" in text:
            return "partial", "Evidence references perimeter controls; verify rule reviews."
        return "non_compliant", "Document firewall or WAF configuration and change control."

    if "password" in name or "default" in name:
        if "mfa" in text or "2fa" in text or "sso" in text:
            return "partial", "MFA/SSO mentioned; verify no default vendor credentials remain."
        return "non_compliant", "Document password policy, MFA, and default-credential removal."

    if "cardholder" in name:
        if "token" in text or "vault" in text or "pci" in text:
            return "partial", "Evidence suggests tokenization or vaulting; validate scope."
        return "non_compliant", "Map cardholder data flows and storage; minimize retention."

    if "antivirus" in name or "malware" in name:
        if "edr" in text or "endpoint" in text or "antivirus" in text:
            return "partial", "Endpoint protection referenced; confirm coverage and updates."
        return "non_compliant", "Document malware defenses on systems handling sensitive data."

    if "secure systems" in name or "applications" in name:
        if "patch" in text or "cve" in text or "update" in text:
            return "partial", "Patching mentioned; tie to inventory and SLAs."
        return "non_compliant", "Document secure configuration baselines and patch management."

    if text.strip():
        return "partial", "Evidence captured; manual review recommended."
    return "non_compliant", "Provide specific evidence for this control."


@router.get("/compliance/{user_id}")
def get_compliance(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    res = supabase.table("compliance_checks").select("*").eq("user_id", user_id).execute()
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
        res2 = supabase.table("compliance_checks").select("*").eq("user_id", user_id).execute()
        rows = res2.data or []
    return {"checks": rows}


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
    found = (q.data or [])
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
    return data[0] if data else found[0]
