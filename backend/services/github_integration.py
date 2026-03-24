"""
GitHub Integration Service - STEP 5

Handles GitHub API interactions:
- PR comment creation
- Repository access
- Webhook verification
- Status checks
"""

from typing import Optional, Dict, List
from dataclasses import dataclass
from datetime import datetime
import hmac
import hashlib
import json
from enum import Enum
import httpx


class CheckRunStatus(str, Enum):
    """GitHub check run status."""
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class CheckConclusionStatus(str, Enum):
    """GitHub check run conclusion."""
    SUCCESS = "success"
    FAILURE = "failure"
    NEUTRAL = "neutral"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"
    ACTION_REQUIRED = "action_required"


@dataclass
class PRComment:
    """Represents a GitHub PR comment."""
    pull_number: int
    repository: str
    body: str
    commit_sha: Optional[str] = None


@dataclass
class CheckRun:
    """Represents a GitHub check run."""
    name: str
    head_sha: str
    status: CheckRunStatus
    conclusion: Optional[CheckConclusionStatus] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    text: Optional[str] = None
    details_url: Optional[str] = None


@dataclass
class GitHubPRInfo:
    """GitHub PR information."""
    number: int
    repository: str
    owner: str
    head_sha: str
    base_ref: str
    head_ref: str
    title: str
    body: str
    author: str
    created_at: str


class GitHubClient:
    """GitHub API client for PR interactions."""

    def __init__(self, token: str, base_url: str = "https://api.github.com"):
        """
        Initialize GitHub client.
        
        Args:
            token: GitHub personal/app access token
            base_url: GitHub API base URL
        """
        self.token = token
        self.base_url = base_url
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "DevPulse-CI/1.0"
        }

    async def create_or_update_pr_comment(
        self,
        owner: str,
        repo: str,
        pull_number: int,
        body: str,
        comment_id: Optional[int] = None
    ) -> Dict:
        """
        Create or update a PR comment.
        
        Args:
            owner: Repository owner
            repo: Repository name
            pull_number: PR number
            body: Comment body (markdown)
            comment_id: Comment ID for updates (None for new)
            
        Returns:
            Comment response from GitHub
        """
        async with httpx.AsyncClient() as client:
            if comment_id:
                # Update existing comment
                url = f"{self.base_url}/repos/{owner}/{repo}/issues/comments/{comment_id}"
                response = await client.patch(
                    url,
                    headers=self.headers,
                    json={"body": body}
                )
            else:
                # Create new comment
                url = f"{self.base_url}/repos/{owner}/{repo}/issues/{pull_number}/comments"
                response = await client.post(
                    url,
                    headers=self.headers,
                    json={"body": body}
                )
            
            response.raise_for_status()
            return response.json()

    async def create_check_run(
        self,
        owner: str,
        repo: str,
        check_run: CheckRun
    ) -> Dict:
        """
        Create a GitHub check run.
        
        Args:
            owner: Repository owner
            repo: Repository name
            check_run: Check run details
            
        Returns:
            Check run response from GitHub
        """
        async with httpx.AsyncClient() as client:
            url = f"{self.base_url}/repos/{owner}/{repo}/check-runs"
            
            payload = {
                "name": check_run.name,
                "head_sha": check_run.head_sha,
                "status": check_run.status.value,
            }
            
            if check_run.conclusion:
                payload["conclusion"] = check_run.conclusion.value
            if check_run.title:
                payload["output"] = {
                    "title": check_run.title,
                    "summary": check_run.summary or "",
                    "text": check_run.text or ""
                }
            if check_run.details_url:
                payload["details_url"] = check_run.details_url
            
            response = await client.post(
                url,
                headers=self.headers,
                json=payload
            )
            
            response.raise_for_status()
            return response.json()

    async def update_check_run(
        self,
        owner: str,
        repo: str,
        check_run_id: int,
        check_run: CheckRun
    ) -> Dict:
        """
        Update a GitHub check run.
        
        Args:
            owner: Repository owner
            repo: Repository name
            check_run_id: Check run ID
            check_run: Updated check run details
            
        Returns:
            Check run response from GitHub
        """
        async with httpx.AsyncClient() as client:
            url = f"{self.base_url}/repos/{owner}/{repo}/check-runs/{check_run_id}"
            
            payload = {
                "status": check_run.status.value,
            }
            
            if check_run.conclusion:
                payload["conclusion"] = check_run.conclusion.value
            if check_run.title:
                payload["output"] = {
                    "title": check_run.title,
                    "summary": check_run.summary or "",
                    "text": check_run.text or ""
                }
            if check_run.details_url:
                payload["details_url"] = check_run.details_url
            
            response = await client.patch(
                url,
                headers=self.headers,
                json=payload
            )
            
            response.raise_for_status()
            return response.json()

    async def get_pr_files(
        self,
        owner: str,
        repo: str,
        pull_number: int
    ) -> List[Dict]:
        """
        Get files changed in a PR.
        
        Args:
            owner: Repository owner
            repo: Repository name
            pull_number: PR number
            
        Returns:
            List of changed files
        """
        async with httpx.AsyncClient() as client:
            url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pull_number}/files"
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def get_pr_info(
        self,
        owner: str,
        repo: str,
        pull_number: int
    ) -> GitHubPRInfo:
        """
        Get PR information.
        
        Args:
            owner: Repository owner
            repo: Repository name
            pull_number: PR number
            
        Returns:
            PR information
        """
        async with httpx.AsyncClient() as client:
            url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pull_number}"
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            
            data = response.json()
            return GitHubPRInfo(
                number=data["number"],
                repository=data["head"]["repo"]["name"],
                owner=data["head"]["repo"]["owner"]["login"],
                head_sha=data["head"]["sha"],
                base_ref=data["base"]["ref"],
                head_ref=data["head"]["ref"],
                title=data["title"],
                body=data["body"] or "",
                author=data["user"]["login"],
                created_at=data["created_at"]
            )

    def verify_webhook_signature(
        self,
        payload_body: bytes,
        signature_header: str,
        secret: str
    ) -> bool:
        """
        Verify GitHub webhook signature.
        
        Args:
            payload_body: Request body bytes
            signature_header: X-Hub-Signature header
            secret: Webhook secret
            
        Returns:
            True if signature is valid
        """
        if not signature_header:
            return False
        
        # Extract signature
        try:
            hash_algorithm, github_signature = signature_header.split("=", 1)
        except ValueError:
            return False
        
        if hash_algorithm != "sha256":
            return False
        
        # Calculate expected signature
        expected_signature = hmac.new(
            secret.encode(),
            payload_body,
            hashlib.sha256
        ).hexdigest()
        
        # Compare signatures (constant time)
        return hmac.compare_digest(github_signature, expected_signature)


class PRCommentFormatter:
    """Formats compliance data for GitHub PR comments."""

    @staticmethod
    def format_compliance_comment(
        endpoint_id: str,
        compliance_score: float,
        critical_issues: int,
        total_issues: int,
        requirements_affected: List[str],
        remediation_url: str
    ) -> str:
        """
        Format compliance data as GitHub PR comment.
        
        Args:
            endpoint_id: Endpoint ID
            compliance_score: Compliance percentage
            critical_issues: Number of critical issues
            total_issues: Total issues
            requirements_affected: List of affected requirements
            remediation_url: Link to remediation dashboard
            
        Returns:
            Markdown formatted comment
        """
        status_icon = "✅" if compliance_score >= 90 else "⚠️" if compliance_score >= 50 else "❌"
        
        comment = f"""## {status_icon} API Security Compliance Check

**Endpoint:** `{endpoint_id}`

### Compliance Status
| Metric | Value |
|--------|-------|
| Overall Score | **{compliance_score:.1f}%** |
| Critical Issues | 🔴 {critical_issues} |
| Total Issues | {total_issues} |
| Status | {_get_status_badge(compliance_score)} |

### Affected Requirements
"""
        
        if requirements_affected:
            for req in requirements_affected[:5]:  # Limit to 5 for brevity
                comment += f"- {req}\n"
            if len(requirements_affected) > 5:
                comment += f"- ... and {len(requirements_affected) - 5} more\n"
        else:
            comment += "- None\n"
        
        comment += f"""
### Actions
- Review [Compliance Details]({remediation_url})
- Address critical issues before merge
- Run `devpulse scan` to verify fixes

> DevPulse API Security • Automated Compliance Check
"""
        return comment

    @staticmethod
    def format_security_findings_comment(
        findings: List[Dict],
        endpoint_url: str
    ) -> str:
        """
        Format security findings as GitHub comment.
        
        Args:
            findings: List of security findings
            endpoint_url: Link to findings
            
        Returns:
            Markdown formatted comment
        """
        critical = [f for f in findings if f.get("risk_level") == "critical"]
        high = [f for f in findings if f.get("risk_level") == "high"]
        medium = [f for f in findings if f.get("risk_level") == "medium"]
        
        comment = """## 🔍 API Security Findings

### Summary
"""
        
        if critical:
            comment += f"🔴 **{len(critical)} Critical** | "
        if high:
            comment += f"🟠 **{len(high)} High** | "
        if medium:
            comment += f"🟡 **{len(medium)} Medium**"
        
        comment += "\n\n"
        
        if critical:
            comment += """### Critical Issues (Must Fix)
"""
            for finding in critical[:3]:
                comment += f"- **{finding.get('name', 'Unknown')}**: {finding.get('description', '')}\n"
            if len(critical) > 3:
                comment += f"- ... and {len(critical) - 3} more\n"
        
        comment += f"""
[View Full Report]({endpoint_url})

> DevPulse • Automated API Security Scanning
"""
        return comment

    @staticmethod
    def format_failed_check_comment(
        error: str,
        documentation_url: str
    ) -> str:
        """
        Format failed check comment.
        
        Args:
            error: Error message
            documentation_url: Link to documentation
            
        Returns:
            Markdown formatted comment
        """
        return f"""## ⚠️ Compliance Check Failed

**Error:** {error}

### Troubleshooting
1. Check that the endpoint is properly configured
2. Verify authentication credentials
3. Ensure the endpoint is accessible

[Documentation]({documentation_url})

> DevPulse • Automated Compliance Checking
"""


def _get_status_badge(score: float) -> str:
    """Get status badge based on compliance score."""
    if score >= 90:
        return "![Compliant](https://img.shields.io/badge/Compliant-green)"
    elif score >= 50:
        return "![Partial](https://img.shields.io/badge/Partial-yellow)"
    else:
        return "![Non--Compliant](https://img.shields.io/badge/Non--Compliant-red)"


# Global GitHub client instance
_github_client: Optional[GitHubClient] = None


def get_github_client(token: Optional[str] = None) -> Optional[GitHubClient]:
    """Get or create GitHub client."""
    global _github_client
    if token:
        _github_client = GitHubClient(token)
    return _github_client


def set_github_token(token: str) -> None:
    """Set GitHub token for client."""
    global _github_client
    _github_client = GitHubClient(token)
