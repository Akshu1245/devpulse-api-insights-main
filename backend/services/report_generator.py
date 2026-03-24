"""
Compliance Report Generator

Generates compliance reports in multiple formats:
- JSON (structured data)
- PDF (audit-ready format)
- HTML (web viewing)

Supports:
- Executive summary
- Detailed findings
- Remediation guidance
- Timeline tracking
"""

from typing import Dict, List, Optional, BinaryIO
from dataclasses import asdict
from datetime import datetime, timedelta
from enum import Enum
import json
from io import BytesIO

from compliance_mapper import (
    ComplianceMapper,
    ComplianceFramework,
    ComplianceLevel,
    RiskLevel,
    get_mapper
)


class ReportFormat(str, Enum):
    """Supported report formats."""
    JSON = "json"
    HTML = "html"
    PDF = "pdf"


class ComplianceReportGenerator:
    """Generates compliance reports from assessments."""

    def __init__(self):
        """Initialize report generator."""
        self.mapper = get_mapper()
        self.organization_name = "API Security Assessment"

    def set_organization_name(self, name: str) -> None:
        """Set organization name for reports."""
        self.organization_name = name

    def generate_json_report(
        self,
        assessment: Dict,
        endpoint_id: Optional[str] = None,
        include_details: bool = True
    ) -> str:
        """Generate JSON compliance report."""
        report = {
            "report_metadata": {
                "generated_at": datetime.utcnow().isoformat(),
                "organization": self.organization_name,
                "endpoint_id": endpoint_id,
                "format": "json",
                "version": "1.0"
            },
            "compliance_summary": {
                "overall_compliance_percentage": assessment["overall_compliance_percentage"],
                "total_issues": assessment["total_issues"],
                "critical_issues": len(assessment["critical_issues"]),
                "compliant_status": self._get_status_string(
                    assessment["overall_compliance_percentage"]
                ),
                "assessment_date": assessment["assessment_timestamp"]
            },
            "requirement_mapping": {} if not include_details else self._detailed_requirements(assessment),
            "critical_findings": [
                self._format_issue(issue) for issue in assessment["critical_issues"]
            ] if include_details else [],
            "remediation_roadmap": self._create_remediation_roadmap(assessment) if include_details else {},
            "audit_trail": {
                "report_generated": datetime.utcnow().isoformat(),
                "compliance_frameworks": ["PCI DSS v4.0", "GDPR"],
                "assessment_scope": "API endpoints",
                "reviewer": "DevPulse Compliance Engine"
            }
        }
        return json.dumps(report, indent=2)

    def generate_html_report(
        self,
        assessment: Dict,
        endpoint_id: Optional[str] = None
    ) -> str:
        """Generate HTML compliance report."""
        status = self._get_status_string(assessment["overall_compliance_percentage"])
        status_icon = self._get_status_icon(assessment["overall_compliance_percentage"])
        
        html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevPulse Compliance Report</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            padding: 40px 20px;
            color: #333;
        }}
        .container {{
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }}
        .header h1 {{
            font-size: 32px;
            margin-bottom: 10px;
        }}
        .header p {{
            font-size: 14px;
            opacity: 0.9;
        }}
        .content {{
            padding: 40px;
        }}
        .summary {{
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 4px;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }}
        .summary-item {{
            background: white;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #e0e0e0;
        }}
        .summary-item .label {{
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 8px;
        }}
        .summary-item .value {{
            font-size: 28px;
            font-weight: bold;
            color: #333;
        }}
        .status {{
            display: inline-block;
            padding: 8px 16px;
            border-radius: 4px;
            font-weight: bold;
            margin: 10px 0;
        }}
        .status.compliant {{
            background: #d4edda;
            color: #155724;
        }}
        .status.partial {{
            background: #fff3cd;
            color: #856404;
        }}
        .status.non-compliant {{
            background: #f8d7da;
            color: #721c24;
        }}
        .requirement {{
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 16px;
        }}
        .requirement-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }}
        .requirement-id {{
            font-weight: bold;
            color: #667eea;
            font-size: 14px;
        }}
        .requirement-level {{
            display: inline-block;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
        }}
        .requirement-level.must-fix {{
            background: #f8d7da;
            color: #721c24;
        }}
        .requirement-level.should-fix {{
            background: #fff3cd;
            color: #856404;
        }}
        .requirement-level.may-fix {{
            background: #d1ecf1;
            color: #0c5460;
        }}
        .requirement-title {{
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
        }}
        .requirement-description {{
            font-size: 14px;
            color: #666;
            margin-bottom: 12px;
        }}
        .requirement-issues {{
            background: #f5f7fa;
            padding: 12px;
            border-radius: 3px;
            margin-bottom: 12px;
        }}
        .requirement-issues h4 {{
            font-size: 12px;
            color: #666;
            margin-bottom: 8px;
            text-transform: uppercase;
        }}
        .issue-item {{
            padding: 8px 0;
            border-bottom: 1px solid #e0e0e0;
            font-size: 13px;
        }}
        .issue-item:last-child {{
            border-bottom: none;
        }}
        .remediation {{
            background: #e8f5e9;
            padding: 16px;
            border-radius: 4px;
            margin-top: 12px;
        }}
        .remediation h4 {{
            color: #2e7d32;
            margin-bottom: 8px;
            font-size: 13px;
        }}
        .remediation ol {{
            margin-left: 20px;
            font-size: 13px;
            color: #333;
        }}
        .remediation li {{
            margin-bottom: 6px;
        }}
        .footer {{
            background: #f8f9fa;
            padding: 20px 40px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
            text-align: center;
        }}
        .icon {{
            font-size: 24px;
            margin-right: 10px;
        }}
        section {{
            margin-bottom: 40px;
        }}
        section h2 {{
            font-size: 20px;
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }}
        .critical-section {{
            border-left: 4px solid #d32f2f;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>DevPulse Compliance Report</h1>
            <p>Security Assessment Report - {self.organization_name}</p>
        </div>

        <div class="content">
            <!-- Executive Summary -->
            <section>
                <h2>Executive Summary</h2>
                <div class="summary">
                    <div class="status {self._get_status_class(assessment['overall_compliance_percentage'])}">
                        {status_icon} {status.upper()}
                    </div>
                    <p style="margin-top: 12px; line-height: 1.6;">
                        This compliance assessment evaluates API endpoints against PCI DSS v4.0 and GDPR requirements.
                        The assessment identified <strong>{assessment['total_issues']}</strong> security issues of which
                        <strong>{len(assessment['critical_issues'])}</strong> are critical and require immediate remediation.
                    </p>
                </div>

                <div class="summary-grid">
                    <div class="summary-item">
                        <div class="label">Compliance Score</div>
                        <div class="value">{assessment['overall_compliance_percentage']}%</div>
                    </div>
                    <div class="summary-item">
                        <div class="label">Total Issues</div>
                        <div class="value">{assessment['total_issues']}</div>
                    </div>
                    <div class="summary-item">
                        <div class="label">Critical Issues</div>
                        <div class="value">{len(assessment['critical_issues'])}</div>
                    </div>
                    <div class="summary-item">
                        <div class="label">Requirements Affected</div>
                        <div class="value">{assessment['unique_requirements_affected']}</div>
                    </div>
                </div>
            </section>

            <!-- Critical Findings -->
            {self._format_critical_section(assessment)}

            <!-- Detailed Requirements -->
            <section>
                <h2>Compliance Requirements</h2>
                {self._format_requirements_section(assessment)}
            </section>

            <!-- Remediation Roadmap -->
            <section>
                <h2>Remediation Roadmap</h2>
                {self._format_roadmap_section(assessment)}
            </section>

            <!-- Certification -->
            <section>
                <h2>Certification & Audit Trail</h2>
                <div class="summary">
                    <p>
                        <strong>Report Generated:</strong> {datetime.utcnow().isoformat()}<br>
                        <strong>Compliance Frameworks:</strong> PCI DSS v4.0, GDPR<br>
                        <strong>Assessment Tool:</strong> DevPulse Compliance Engine v1.0<br>
                        <strong>This report is automatically generated and should be reviewed by security professionals.</strong>
                    </p>
                </div>
            </section>
        </div>

        <div class="footer">
            <p>DevPulse Compliance Report | Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
            <p>For questions or clarifications, contact your security team.</p>
        </div>
    </div>
</body>
</html>
        """
        return html

    def _format_critical_section(self, assessment: Dict) -> str:
        """Format critical findings section."""
        if not assessment["critical_issues"]:
            return ""
        
        items = "\n".join([
            f"<div class='issue-item'>⚠️ <strong>{issue.get('type', 'Unknown')}</strong>: {issue.get('name', 'Unknown issue')}</div>"
            for issue in assessment["critical_issues"]
        ])
        
        return f"""
        <section class="critical-section">
            <h2>🔴 Critical Findings</h2>
            <div style="background: #ffebee; border-left: 4px solid #d32f2f; padding: 16px; border-radius: 4px;">
                <strong>Immediate Action Required</strong>
                <p style="margin-top: 8px; color: #333;">The following critical issues must be addressed immediately:</p>
                {items}
            </div>
        </section>
        """

    def _format_requirements_section(self, assessment: Dict) -> str:
        """Format requirements section."""
        html_items = []
        must_fix_count = 0
        should_fix_count = 0

        for key, req_data in assessment["mapped_requirements"].items():
            req = req_data["requirement"]
            issues = req_data["issues"]
            level_class = req.level.value.replace("-", "-")

            if req.level == ComplianceLevel.MUST_FIX:
                must_fix_count += 1
            elif req.level == ComplianceLevel.SHOULD_FIX:
                should_fix_count += 1

            issues_html = "\n".join([
                f"<div class='issue-item'>• {issue.get('type', 'Unknown')}: {issue.get('name', 'Unknown')}</div>"
                for issue in issues
            ])

            remediation_html = "\n".join([
                f"<li>{step}</li>" for step in req.remediation_steps
            ])

            html_items.append(f"""
            <div class="requirement">
                <div class="requirement-header">
                    <div>
                        <div class="requirement-id">{req.framework.upper()} - {req.requirement_id}</div>
                        <div class="requirement-title">{req.requirement_name}</div>
                    </div>
                    <span class="requirement-level {level_class}">{req.level.value}</span>
                </div>
                <div class="requirement-description">{req.description}</div>
                <div class="requirement-issues">
                    <h4>Associated Issues ({len(issues)})</h4>
                    {issues_html}
                </div>
                <div class="remediation">
                    <h4>Remediation Steps</h4>
                    <ol>
                        {remediation_html}
                    </ol>
                    <p style="margin-top: 12px; font-size: 12px; color: #555;"><strong>Audit Guidance:</strong> {req.audit_guidance}</p>
                </div>
            </div>
            """)

        return "\n".join(html_items)

    def _format_roadmap_section(self, assessment: Dict) -> str:
        """Format remediation roadmap section."""
        critical_deadline = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
        high_deadline = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d")
        medium_deadline = (datetime.utcnow() + timedelta(days=90)).strftime("%Y-%m-%d")

        return f"""
        <div style="background: #f5f7fa; padding: 20px; border-radius: 4px;">
            <div style="margin-bottom: 20px;">
                <h3 style="color: #d32f2f; margin-bottom: 10px;">🔴 Critical (Must-Fix) - Due: {critical_deadline}</h3>
                <p>Immediately address critical vulnerabilities that could impact data security and compliance.</p>
            </div>
            <div style="margin-bottom: 20px;">
                <h3 style="color: #f57c00; margin-bottom: 10px;">🟠 High (Should-Fix) - Due: {high_deadline}</h3>
                <p>Resolve high-risk issues within 30 days to maintain compliance posture.</p>
            </div>
            <div style="margin-bottom: 20px;">
                <h3 style="color: #1976d2; margin-bottom: 10px;">🔵 Medium (May-Fix) - Due: {medium_deadline}</h3>
                <p>Address medium-risk issues within 90 days as part of regular improvement initiatives.</p>
            </div>
            <div>
                <h3 style="color: #388e3c; margin-bottom: 10px;">🟢 Recommended - Ongoing</h3>
                <p>Implement recommended best practices to enhance overall security posture.</p>
            </div>
        </div>
        """

    @staticmethod
    def _get_status_string(compliance_percentage: float) -> str:
        """Get human-readable status string."""
        if compliance_percentage >= 90:
            return "Compliant"
        elif compliance_percentage >= 50:
            return "Partially Compliant"
        else:
            return "Non-Compliant"

    @staticmethod
    def _get_status_icon(compliance_percentage: float) -> str:
        """Get status icon."""
        if compliance_percentage >= 90:
            return "🟢"
        elif compliance_percentage >= 50:
            return "🟡"
        else:
            return "🔴"

    @staticmethod
    def _get_status_class(compliance_percentage: float) -> str:
        """Get status CSS class."""
        if compliance_percentage >= 90:
            return "compliant"
        elif compliance_percentage >= 50:
            return "partial"
        else:
            return "non-compliant"

    def _format_issue(self, issue: Dict) -> Dict:
        """Format issue for JSON output."""
        return {
            "type": issue.get("type"),
            "name": issue.get("name"),
            "risk_level": issue.get("risk_level"),
            "description": issue.get("description"),
            "affected_data_types": issue.get("affected_data_types", [])
        }

    def _detailed_requirements(self, assessment: Dict) -> Dict:
        """Extract detailed requirements from assessment."""
        result = {}
        for key, req_data in assessment["mapped_requirements"].items():
            req = req_data["requirement"]
            result[key] = {
                "framework": req.framework,
                "requirement_id": req.requirement_id,
                "requirement_name": req.requirement_name,
                "description": req.description,
                "level": req.level.value,
                "remediation_steps": req.remediation_steps,
                "audit_guidance": req.audit_guidance,
                "associated_issues_count": len(req_data["issues"]),
                "associated_issues": [
                    self._format_issue(issue) for issue in req_data["issues"]
                ]
            }
        return result

    def _create_remediation_roadmap(self, assessment: Dict) -> Dict:
        """Create remediation timeline."""
        critical_deadline = (datetime.utcnow() + timedelta(days=7)).isoformat()
        high_deadline = (datetime.utcnow() + timedelta(days=30)).isoformat()
        medium_deadline = (datetime.utcnow() + timedelta(days=90)).isoformat()

        return {
            "critical": {
                "deadline": critical_deadline,
                "description": "Immediately address critical vulnerabilities",
                "action_items": [
                    issue.get("type") for issue in assessment["critical_issues"]
                ]
            },
            "high": {
                "deadline": high_deadline,
                "description": "Resolve within 30 days",
                "action_items": []
            },
            "medium": {
                "deadline": medium_deadline,
                "description": "Address within 90 days",
                "action_items": []
            },
            "low": {
                "deadline": None,
                "description": "Implement best practices",
                "action_items": []
            }
        }


def generate_compliance_report(
    assessment: Dict,
    format: ReportFormat = ReportFormat.JSON,
    endpoint_id: Optional[str] = None,
    organization_name: str = "API Security Assessment"
) -> str:
    """Generate compliance report in specified format."""
    generator = ComplianceReportGenerator()
    generator.set_organization_name(organization_name)

    if format == ReportFormat.JSON:
        return generator.generate_json_report(assessment, endpoint_id)
    elif format == ReportFormat.HTML:
        return generator.generate_html_report(assessment, endpoint_id)
    else:
        raise ValueError(f"Unsupported format: {format}")
