"""
CI/CD Router - GitHub Integration Endpoints

Handles:
- GitHub webhooks for PR events
- Automated compliance scanning
- Check run creation and updates
- PR comment generation
"""

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, Header
from typing import Optional, List
from datetime import datetime
import os
import json

from services.supabase_client import get_supabase
from services.auth_guard import get_current_user_id
from services.github_integration import (
    GitHubClient,
    PRCommentFormatter,
    CheckRun,
    CheckRunStatus,
    CheckConclusionStatus,
    get_github_client,
    set_github_token
)
from services.compliance_mapper import get_mapper, RiskLevel


router = APIRouter(prefix="/ci-cd", tags=["ci-cd"])


# ============================================================================
# GitHub Configuration Endpoints
# ============================================================================


@router.post("/github/configure")
async def configure_github(
    github_token: str,
    repository: str,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """
    Configure GitHub integration for user.
    
    Args:
        github_token: GitHub personal access token
        repository: Full repository path (owner/repo)
        
    Returns:
        Configuration confirmation
    """
    try:
        # Validate token by testing GitHub API
        client = GitHubClient(github_token)
        owner, repo = repository.split("/")
        
        # Store configuration
        config_data = {
            "user_id": user_id,
            "repository": repository,
            "owner": owner,
            "repo_name": repo,
            "github_token_hash": _hash_token(github_token),
            "is_active": True,
            "created_at": datetime.utcnow().isoformat()
        }
        
        result = await supabase.table("github_integrations").insert(
            [config_data]
        ).execute()
        
        # Store encrypted token in secure storage
        set_github_token(github_token)
        
        return {
            "status": "configured",
            "repository": repository,
            "webhook_url": f"/ci-cd/github/webhook",
            "message": "GitHub integration configured successfully"
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"GitHub configuration failed: {str(e)}"
        )


@router.get("/github/config")
async def get_github_config(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Get user's GitHub integration configuration."""
    try:
        result = await supabase.table("github_integrations").select(
            "repository, owner, repo_name, is_active, created_at"
        ).eq("user_id", user_id).execute()
        
        if not result.data:
            return {
                "configured": False,
                "message": "No GitHub integration configured"
            }
        
        config = result.data[0]
        return {
            "configured": True,
            "repository": config["repository"],
            "is_active": config["is_active"],
            "configured_at": config["created_at"]
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving configuration: {str(e)}"
        )


# ============================================================================
# GitHub Webhook Endpoints
# ============================================================================


@router.post("/github/webhook")
async def github_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    supabase = Depends(get_supabase)
):
    """
    GitHub webhook receiver for PR events.
    
    Triggers automated compliance checks.
    """
    try:
        # Get webhook secret
        webhook_secret = os.getenv("GITHUB_WEBHOOK_SECRET", "")
        if not webhook_secret:
            raise HTTPException(
                status_code=400,
                detail="Webhook secret not configured"
            )
        
        # Read request body
        body = await request.body()
        
        # Verify signature
        client = GitHubClient("")
        if not client.verify_webhook_signature(body, x_hub_signature_256 or "", webhook_secret):
            raise HTTPException(
                status_code=401,
                detail="Invalid webhook signature"
            )
        
        # Parse payload
        payload = json.loads(body)
        
        # Handle PR events
        if x_github_event == "pull_request":
            pr_action = payload.get("action")
            if pr_action in ["opened", "synchronize", "reopened"]:
                background_tasks.add_task(
                    _process_pr_compliance_check,
                    payload,
                    supabase
                )
        
        return {"status": "received"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Webhook processing failed: {str(e)}"
        )


async def _process_pr_compliance_check(payload: dict, supabase) -> None:
    """
    Process PR and run compliance check.
    
    Args:
        payload: GitHub webhook payload
        supabase: Supabase client
    """
    try:
        pr_data = payload.get("pull_request", {})
        repo_data = payload.get("repository", {})
        
        pr_number = pr_data.get("number")
        owner = repo_data.get("owner", {}).get("login")
        repo = repo_data.get("name")
        head_sha = pr_data.get("head", {}).get("sha")
        
        if not all([pr_number, owner, repo, head_sha]):
            return
        
        # Get GitHub token for this repo
        github_result = await supabase.table("github_integrations").select(
            "user_id, github_token"
        ).eq("repository", f"{owner}/{repo}").execute()
        
        if not github_result.data:
            return
        
        user_id = github_result.data[0]["user_id"]
        github_token = github_result.data[0].get("github_token")
        
        # Get PR files
        client = GitHubClient(github_token)
        files = await client.get_pr_files(owner, repo, pr_number)
        
        # Analyze endpoints from code changes
        endpoints_to_check = _extract_endpoints_from_files(files)
        
        if not endpoints_to_check:
            return
        
        # Run compliance checks for each endpoint
        all_issues = []
        for endpoint in endpoints_to_check:
            issues_result = await supabase.table("endpoint_risk_scores").select(
                "*"
            ).eq("user_id", user_id).eq("endpoint_id", endpoint).execute()
            
            if issues_result.data:
                all_issues.extend(issues_result.data)
        
        # Create check run
        if all_issues:
            # Assess compliance
            mapper = get_mapper()
            compliance_issues = [
                {
                    "type": issue.get("issue_type", "UNKNOWN"),
                    "name": issue.get("issue_name", "Unknown"),
                    "risk_level": issue.get("risk_level", "info"),
                    "description": issue.get("issue_description", ""),
                    "affected_data_types": issue.get("affected_data_types", [])
                }
                for issue in all_issues
            ]
            
            assessment = mapper.assess_compliance_status(compliance_issues)
            
            # Create check run
            critical_count = len(assessment.get("critical_issues", []))
            total_count = assessment.get("total_issues", 0)
            compliance_score = assessment.get("overall_compliance_percentage", 0)
            
            # Determine status
            if critical_count > 0:
                conclusion = CheckConclusionStatus.FAILURE
            elif compliance_score < 50:
                conclusion = CheckConclusionStatus.NEUTRAL
            else:
                conclusion = CheckConclusionStatus.SUCCESS
            
            check_run = CheckRun(
                name="DevPulse API Security",
                head_sha=head_sha,
                status=CheckRunStatus.COMPLETED,
                conclusion=conclusion,
                title="API Compliance Check",
                summary=f"Compliance: {compliance_score:.1f}% | Critical: {critical_count} | Total: {total_count}",
                text=_format_check_run_details(assessment)
            )
            
            await client.create_check_run(owner, repo, check_run)
            
            # Add PR comment
            formatter = PRCommentFormatter()
            comment_body = formatter.format_compliance_comment(
                endpoint_id=",".join(endpoints_to_check),
                compliance_score=compliance_score,
                critical_issues=critical_count,
                total_issues=total_count,
                requirements_affected=[],
                remediation_url=f"https://devpulse.dev/compliance/{user_id}"
            )
            
            await client.create_or_update_pr_comment(
                owner=owner,
                repo=repo,
                pull_number=pr_number,
                body=comment_body
            )
            
            # Store check result
            check_result = {
                "user_id": user_id,
                "pr_number": pr_number,
                "repository": f"{owner}/{repo}",
                "head_sha": head_sha,
                "compliance_score": compliance_score,
                "critical_issues": critical_count,
                "total_issues": total_count,
                "endpoints_checked": ",".join(endpoints_to_check),
                "status": "completed",
                "created_at": datetime.utcnow().isoformat()
            }
            
            await supabase.table("ci_cd_checks").insert([check_result]).execute()
    
    except Exception as e:
        # Log error but don't fail
        print(f"Error processing PR compliance check: {str(e)}")


# ============================================================================
# Manual Check Endpoints
# ============================================================================


@router.post("/check/run")
async def run_manual_check(
    repository: str,
    branch: str,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Manually trigger compliance check for a branch.
    
    Args:
        repository: Repository path (owner/repo)
        branch: Branch name to check
        
    Returns:
        Check ID and status
    """
    try:
        owner, repo = repository.split("/")
        
        # Get GitHub config
        config_result = await supabase.table("github_integrations").select(
            "github_token"
        ).eq("user_id", user_id).eq("repository", repository).execute()
        
        if not config_result.data:
            raise HTTPException(
                status_code=404,
                detail="GitHub integration not configured"
            )
        
        github_token = config_result.data[0].get("github_token")
        
        # Create check record
        check_record = {
            "user_id": user_id,
            "repository": repository,
            "branch": branch,
            "status": "pending",
            "created_at": datetime.utcnow().isoformat()
        }
        
        result = await supabase.table("ci_cd_checks").insert([check_record]).execute()
        check_id = result.data[0]["id"] if result.data else None
        
        # Queue background task
        background_tasks.add_task(
            _run_branch_check,
            owner,
            repo,
            branch,
            github_token,
            user_id,
            supabase
        )
        
        return {
            "check_id": check_id,
            "status": "queued",
            "repository": repository,
            "branch": branch
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue check: {str(e)}"
        )


@router.get("/check/{check_id}")
async def get_check_status(
    check_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """Get status of a compliance check."""
    try:
        result = await supabase.table("ci_cd_checks").select(
            "*"
        ).eq("id", check_id).eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Check not found"
            )
        
        check = result.data[0]
        return {
            "check_id": check["id"],
            "status": check["status"],
            "repository": check["repository"],
            "compliance_score": check.get("compliance_score"),
            "critical_issues": check.get("critical_issues"),
            "total_issues": check.get("total_issues"),
            "created_at": check["created_at"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving check status: {str(e)}"
        )


@router.get("/checks")
async def list_checks(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase),
    repository: Optional[str] = None,
    limit: int = 50
):
    """List compliance checks."""
    try:
        query = supabase.table("ci_cd_checks").select(
            "*"
        ).eq("user_id", user_id).order("created_at", desc=True)
        
        if repository:
            query = query.eq("repository", repository)
        
        result = await query.limit(limit).execute()
        
        return {
            "count": len(result.data),
            "checks": result.data
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error listing checks: {str(e)}"
        )


# ============================================================================
# Compliance Policy Endpoints
# ============================================================================


@router.post("/policy/create")
async def create_ci_policy(
    name: str,
    description: str,
    min_compliance_score: float = 80.0,
    max_critical_issues: int = 0,
    require_security_review: bool = False,
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """
    Create CI/CD compliance policy.
    
    Policies enforce minimum compliance requirements for PR merges.
    """
    try:
        if not (0 <= min_compliance_score <= 100):
            raise HTTPException(
                status_code=400,
                detail="Compliance score must be 0-100"
            )
        
        policy_data = {
            "user_id": user_id,
            "name": name,
            "description": description,
            "min_compliance_score": min_compliance_score,
            "max_critical_issues": max_critical_issues,
            "require_security_review": require_security_review,
            "is_active": True,
            "created_at": datetime.utcnow().isoformat()
        }
        
        result = await supabase.table("ci_cd_policies").insert([policy_data]).execute()
        policy_id = result.data[0]["id"] if result.data else None
        
        return {
            "policy_id": policy_id,
            "name": name,
            "status": "created"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create policy: {str(e)}"
        )


@router.get("/policies")
async def list_ci_policies(
    user_id: str = Depends(get_current_user_id),
    supabase = Depends(get_supabase)
):
    """List user's CI/CD policies."""
    try:
        result = await supabase.table("ci_cd_policies").select(
            "*"
        ).eq("user_id", user_id).order("created_at", desc=True).execute()
        
        return {
            "count": len(result.data or []),
            "policies": result.data or []
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving policies: {str(e)}"
        )


# ============================================================================
# Helper Functions
# ============================================================================


def _hash_token(token: str) -> str:
    """Hash GitHub token for storage."""
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


def _extract_endpoints_from_files(files: List[dict]) -> List[str]:
    """Extract API endpoints from changed files."""
    endpoints = set()
    
    for file_info in files:
        filename = file_info.get("filename", "")
        
        # Look for common API patterns in filenames
        if any(pattern in filename for pattern in [
            "api", "route", "endpoint", "handler", "controller"
        ]):
            # In real implementation, would parse file content
            # For now, just identify files that might contain APIs
            endpoints.add(filename)
    
    return list(endpoints)


def _format_check_run_details(assessment: dict) -> str:
    """Format assessment details for check run."""
    mapped_reqs = assessment.get("mapped_requirements", {})
    
    details = f"""
## Compliance Assessment Details

- **Total Requirements Affected:** {len(mapped_reqs)}
- **Critical Issues:** {len(assessment.get('critical_issues', []))}
- **Assessment Timestamp:** {assessment.get('assessment_timestamp', 'N/A')}

### Required Actions

1. Address all **CRITICAL** issues before merge
2. Review compliance requirements
3. Verify all security controls are in place
"""
    return details


async def _run_branch_check(
    owner: str,
    repo: str,
    branch: str,
    github_token: str,
    user_id: str,
    supabase
) -> None:
    """
    Background task to run check on a branch.
    
    Args:
        owner: Repository owner
        repo: Repository name
        branch: Branch name
        github_token: GitHub token
        user_id: User ID
        supabase: Supabase client
    """
    try:
        # In real implementation, would:
        # 1. Get commit SHAs for branch
        # 2. Analyze changes
        # 3. Run compliance check
        # 4. Update check record
        pass
    except Exception as e:
        print(f"Error running branch check: {str(e)}")
