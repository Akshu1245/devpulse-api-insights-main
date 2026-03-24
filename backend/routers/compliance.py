"""
Compliance Router - FastAPI endpoints for compliance operations

Provides endpoints for:
- Running compliance assessments
- Generating compliance reports
- Tracking remediation progress
- Exporting evidence and audit trails
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime, timedelta
from uuid import UUID
import json
from io import BytesIO

from services.supabase_client import get_supabase
from services.auth_guard import get_current_user_id
from services.compliance_mapper import (
    get_mapper,
    RiskLevel,
    ComplianceFramework
)
from services.report_generator import (
    generate_compliance_report,
    ReportFormat,
    ComplianceReportGenerator
)


router = APIRouter(prefix="/compliance", tags=["compliance"])


# ============================================================================
# Compliance Assessment Endpoints
# ============================================================================


@router.post("/assess")
async def run_compliance_assessment(
    endpoint_id: str,
    assessment_type: str = "combined",  # 'pci_dss_v4', 'gdpr', 'combined'
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Run compliance assessment for an endpoint.
    
    Retrieves security issues from endpoint_risk_scores and maps them
    to PCI DSS v4.0 and GDPR requirements.
    
    Args:
        endpoint_id: Target endpoint ID
        assessment_type: 'pci_dss_v4', 'gdpr', or 'combined'
        
    Returns:
        Assessment ID and initial results
    """
    try:
        # Fetch all issues for endpoint
        issues_response = await supabase.table("endpoint_risk_scores").select(
            "*"
        ).eq("user_id", user_id).eq("endpoint_id", endpoint_id).execute()
        
        issues_data = issues_response.data
        if not issues_data:
            raise HTTPException(
                status_code=404,
                detail="No security issues found for endpoint"
            )
        
        # Transform issues for compliance mapper
        issues = []
        for issue in issues_data:
            issues.append({
                "type": issue.get("issue_type", "UNKNOWN"),
                "name": issue.get("issue_name", "Unknown Issue"),
                "risk_level": issue.get("risk_level", "info"),
                "description": issue.get("issue_description", ""),
                "affected_data_types": issue.get("affected_data_types", [])
            })
        
        # Run compliance assessment
        mapper = get_mapper()
        assessment = mapper.assess_compliance_status(issues)
        
        # Store assessment in database
        assessment_data = {
            "user_id": user_id,
            "endpoint_id": endpoint_id,
            "assessment_type": assessment_type,
            "overall_compliance_percentage": assessment["overall_compliance_percentage"],
            "total_issues": assessment["total_issues"],
            "critical_issues": len(assessment["critical_issues"]),
            "requirements_affected": assessment["unique_requirements_affected"],
            "compliance_status": _get_compliance_status(
                assessment["overall_compliance_percentage"]
            ),
            "assessment_data": assessment
        }
        
        result = await supabase.table("compliance_assessments").insert(
            [assessment_data]
        ).execute()
        
        assessment_id = result.data[0]["id"] if result.data else None
        
        # Store individual issues for tracking
        if assessment_id:
            await _store_compliance_issues(
                supabase,
                user_id,
                assessment_id,
                assessment
            )
        
        return {
            "assessment_id": assessment_id,
            "compliant": assessment["overall_compliance_percentage"],
            "total_issues": assessment["total_issues"],
            "critical_issues": len(assessment["critical_issues"]),
            "requirements_affected": assessment["unique_requirements_affected"],
            "status": _get_compliance_status(
                assessment["overall_compliance_percentage"]
            )
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Compliance assessment failed: {str(e)}"
        )


@router.get("/assessment/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Get detailed compliance assessment."""
    try:
        result = await supabase.table("compliance_assessments").select(
            "*"
        ).eq("id", assessment_id).eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Assessment not found"
            )
        
        assessment = result.data[0]
        
        # Fetch associated issues
        issues_result = await supabase.table("compliance_issues").select(
            "*"
        ).eq("assessment_id", assessment_id).execute()
        
        return {
            "assessment": assessment,
            "issues": issues_result.data or [],
            "summary": {
                "status": assessment["compliance_status"],
                "score": assessment["overall_compliance_percentage"],
                "critical": assessment["critical_issues"],
                "total": assessment["total_issues"]
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving assessment: {str(e)}"
        )


@router.get("/assessments")
async def list_assessments(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase),
    endpoint_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500)
):
    """List compliance assessments with filtering."""
    try:
        query = supabase.table("compliance_assessments").select(
            "*"
        ).eq("user_id", user_id).order("created_at", desc=True)
        
        if endpoint_id:
            query = query.eq("endpoint_id", endpoint_id)
        if status:
            query = query.eq("compliance_status", status)
        
        result = await query.limit(limit).execute()
        
        return {
            "count": len(result.data),
            "assessments": result.data
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error listing assessments: {str(e)}"
        )


# ============================================================================
# Compliance Issues Endpoints
# ============================================================================


@router.get("/issues")
async def get_compliance_issues(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase),
    framework: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500)
):
    """List compliance issues with filtering."""
    try:
        query = supabase.table("compliance_issues").select(
            "*"
        ).eq("user_id", user_id).order("created_at", desc=True)
        
        if framework:
            query = query.eq("framework", framework)
        if risk_level:
            query = query.eq("risk_level", risk_level)
        if status:
            query = query.eq("status", status)
        
        result = await query.limit(limit).execute()
        
        # Group by requirement
        grouped = {}
        for issue in result.data:
            key = f"{issue['framework']}:{issue['requirement_id']}"
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(issue)
        
        return {
            "count": len(result.data),
            "grouped_by_requirement": grouped,
            "issues": result.data
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving issues: {str(e)}"
        )


@router.patch("/issues/{issue_id}")
async def update_issue_status(
    issue_id: str,
    new_status: str,
    resolution_notes: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Update compliance issue status."""
    try:
        valid_statuses = ["open", "in_progress", "resolved", "accepted_risk"]
        if new_status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Must be one of: {valid_statuses}"
            )
        
        update_data = {"status": new_status}
        if new_status == "resolved":
            update_data["resolution_date"] = datetime.utcnow().isoformat()
        if resolution_notes:
            update_data["resolution_notes"] = resolution_notes
        
        result = await supabase.table("compliance_issues").update(
            update_data
        ).eq("id", issue_id).eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Issue not found"
            )
        
        return {
            "issue_id": issue_id,
            "status": new_status,
            "updated_at": datetime.utcnow().isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error updating issue: {str(e)}"
        )


# ============================================================================
# Compliance Reports Endpoints
# ============================================================================


@router.post("/reports/generate")
async def generate_report(
    assessment_id: str,
    report_format: str = "html",  # 'json', 'html'
    organization_name: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Generate compliance report in specified format."""
    try:
        # Get assessment
        result = await supabase.table("compliance_assessments").select(
            "*"
        ).eq("id", assessment_id).eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Assessment not found"
            )
        
        assessment = result.data[0]
        
        # Generate report
        format_enum = ReportFormat(report_format)
        report_content = generate_compliance_report(
            assessment["assessment_data"],
            format=format_enum,
            endpoint_id=assessment["endpoint_id"],
            organization_name=organization_name or "API Security Assessment"
        )
        
        # Store report
        report_data = {
            "user_id": user_id,
            "assessment_id": assessment_id,
            "report_type": report_format,
            "report_format": "full",
            "report_content": report_content.encode() if report_format == "html" else report_content.encode(),
            "organization_name": organization_name or "API Security Assessment",
            "report_hash": _generate_hash(report_content)
        }
        
        report_result = await supabase.table("compliance_reports").insert(
            [report_data]
        ).execute()
        
        report_id = report_result.data[0]["id"] if report_result.data else None
        
        return {
            "report_id": report_id,
            "format": report_format,
            "size": len(report_content),
            "generated_at": datetime.utcnow().isoformat()
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {str(e)}"
        )


@router.get("/reports/{report_id}")
async def get_report(
    report_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Download compliance report."""
    try:
        result = await supabase.table("compliance_reports").select(
            "*"
        ).eq("id", report_id).eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Report not found"
            )
        
        report = result.data[0]
        content = report["report_content"]
        
        # Return appropriate response type
        if report["report_type"] == "html":
            return StreamingResponse(
                BytesIO(content),
                media_type="text/html",
                headers={
                    "Content-Disposition": f"attachment; filename=compliance_report_{report_id}.html"
                }
            )
        elif report["report_type"] == "json":
            return StreamingResponse(
                BytesIO(content),
                media_type="application/json",
                headers={
                    "Content-Disposition": f"attachment; filename=compliance_report_{report_id}.json"
                }
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving report: {str(e)}"
        )


@router.get("/reports")
async def list_reports(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase),
    assessment_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500)
):
    """List generated compliance reports."""
    try:
        query = supabase.table("compliance_reports").select(
            "id, assessment_id, report_type, generated_at, organization_name"
        ).eq("user_id", user_id).order("generated_at", desc=True)
        
        if assessment_id:
            query = query.eq("assessment_id", assessment_id)
        
        result = await query.limit(limit).execute()
        
        return {
            "count": len(result.data),
            "reports": result.data
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error listing reports: {str(e)}"
        )


# ============================================================================
# Remediation Planning Endpoints
# ============================================================================


@router.get("/remediation-plan")
async def get_remediation_plan(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase),
    assessment_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Get remediation plan with progress tracking."""
    try:
        query = supabase.table("compliance_remediation_plan").select(
            "*"
        ).eq("user_id", user_id).order("target_date", asc=True)
        
        if assessment_id:
            query = query.eq("assessment_id", assessment_id)
        if status:
            query = query.eq("status", status)
        
        result = await query.execute()
        
        # Group by status
        grouped = {
            "pending": [],
            "in_progress": [],
            "completed": [],
            "blocked": []
        }
        
        for item in result.data:
            status_key = item["status"]
            if status_key in grouped:
                grouped[status_key].append(item)
        
        return {
            "total_items": len(result.data),
            "by_status": {k: len(v) for k, v in grouped.items()},
            "items": result.data
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving remediation plan: {str(e)}"
        )


@router.patch("/remediation-plan/{plan_id}")
async def update_remediation_item(
    plan_id: str,
    status: Optional[str] = None,
    completion_date: Optional[str] = None,
    notes: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Update remediation plan item status."""
    try:
        update_data = {}
        if status:
            update_data["status"] = status
        if completion_date:
            update_data["completion_date"] = completion_date
        if notes:
            update_data["notes"] = notes
        
        result = await supabase.table("compliance_remediation_plan").update(
            update_data
        ).eq("id", plan_id).eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Remediation item not found"
            )
        
        return result.data[0]
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error updating remediation item: {str(e)}"
        )


# ============================================================================
# Compliance Dashboard Endpoints
# ============================================================================


@router.get("/dashboard-summary")
async def get_dashboard_summary(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Get compliance dashboard summary for user."""
    try:
        # Get summary from materialized view
        result = await supabase.table("compliance_dashboard_summary").select(
            "*"
        ).eq("user_id", user_id).execute()
        
        if result.data:
            return result.data[0]
        
        return {
            "user_id": user_id,
            "compliant_assessments": 0,
            "partially_compliant_assessments": 0,
            "non_compliant_assessments": 0,
            "total_assessments": 0,
            "avg_compliance_score": 0,
            "critical_issues_count": 0,
            "open_issues_count": 0,
            "last_assessment_date": None
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving dashboard summary: {str(e)}"
        )


# ============================================================================
# Helper Functions
# ============================================================================


def _get_compliance_status(compliance_percentage: float) -> str:
    """Convert compliance percentage to status."""
    if compliance_percentage >= 90:
        return "compliant"
    elif compliance_percentage >= 50:
        return "partially_compliant"
    else:
        return "non_compliant"


async def _store_compliance_issues(
    supabase,
    user_id: str,
    assessment_id: str,
    assessment: dict
) -> None:
    """Store individual compliance issues."""
    issues_to_store = []
    
    for key, req_data in assessment.get("mapped_requirements", {}).items():
        req = req_data.get("requirement")
        issues = req_data.get("issues", [])
        
        if not req:
            continue
        
        for issue in issues:
            issue_record = {
                "user_id": user_id,
                "assessment_id": assessment_id,
                "issue_type": issue.get("type", "UNKNOWN"),
                "issue_name": issue.get("name", "Unknown"),
                "risk_level": issue.get("risk_level", "info"),
                "framework": req["framework"],
                "requirement_id": req["requirement_id"],
                "requirement_name": req["requirement_name"],
                "compliance_level": req["level"],
                "remediation_steps": req["remediation_steps"],
                "audit_guidance": req["audit_guidance"],
                "affected_data_types": req.get("affected_data_types", []),
                "status": "open",
                "remediation_target_date": (
                    datetime.utcnow() + timedelta(days=7)
                ).strftime("%Y-%m-%d") if req["level"] == "must-fix" else (
                    datetime.utcnow() + timedelta(days=30)
                ).strftime("%Y-%m-%d")
            }
            issues_to_store.append(issue_record)
    
    if issues_to_store:
        await supabase.table("compliance_issues").insert(
            issues_to_store
        ).execute()


def _generate_hash(content: str) -> str:
    """Generate hash for content deduplication."""
    import hashlib
    return hashlib.sha256(content.encode()).hexdigest()
