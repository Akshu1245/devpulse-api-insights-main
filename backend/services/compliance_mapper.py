"""
Compliance Mapper Module

Maps security issues (OWASP, CWE) to compliance requirements:
- PCI DSS v4.0
- GDPR (EU 2016/679)
- HIPAA (for future use)

Supports:
- Issue-to-requirement mapping
- Risk level to compliance action mapping
- Compliance report generation
- Audit trail generation
"""

from typing import Dict, List, Optional, Tuple
from enum import Enum
from dataclasses import dataclass
from datetime import datetime
import json


class ComplianceFramework(str, Enum):
    """Supported compliance frameworks."""
    PCI_DSS_V4 = "pci_dss_v4"
    GDPR = "gdpr"
    HIPAA = "hipaa"


class ComplianceLevel(str, Enum):
    """Compliance level of a requirement."""
    MUST_FIX = "must-fix"        # Critical - immediate action
    SHOULD_FIX = "should-fix"    # High - fix within 30 days
    MAY_FIX = "may-fix"          # Medium - fix within 90 days
    RECOMMENDED = "recommended" # Low - best practice


class RiskLevel(str, Enum):
    """Risk levels from security scan."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class ComplianceRequirement:
    """Represents a compliance requirement."""
    framework: str
    requirement_id: str
    requirement_name: str
    description: str
    level: ComplianceLevel
    affected_data_types: List[str]  # e.g., ["payment_cards", "pii", "health"]
    remediation_steps: List[str]
    audit_guidance: str


@dataclass
class IssueMapping:
    """Maps a security issue to compliance requirements."""
    issue_type: str  # e.g., "OWASP-A01", "CWE-79"
    issue_name: str
    risk_level: RiskLevel
    requirements: List[ComplianceRequirement]
    keywords: List[str]  # For search/matching


class ComplianceMapper:
    """Maps security issues to compliance requirements."""

    def __init__(self):
        """Initialize compliance mapper with mappings."""
        self.issue_mappings: Dict[str, IssueMapping] = {}
        self.requirement_cache: Dict[str, ComplianceRequirement] = {}
        self._initialize_mappings()

    def _initialize_mappings(self) -> None:
        """Initialize OWASP to PCI DSS and GDPR mappings."""
        
        # OWASP A01: Broken Access Control
        self.issue_mappings["OWASP-A01"] = IssueMapping(
            issue_type="OWASP-A01",
            issue_name="Broken Access Control",
            risk_level=RiskLevel.CRITICAL,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="7",
                    name="Access Control (Requirement 7)",
                    desc="Restrict access to cardholder data by business need and role",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Implement role-based access control (RBAC)",
                        "Enforce principle of least privilege",
                        "Audit access logs monthly",
                        "Review user permissions quarterly"
                    ],
                    audit="Verify roles match business functions; check access denied audit logs"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures",
                    desc="Implement appropriate technical measures to ensure security",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["pii", "health", "financial"],
                    steps=[
                        "Implement access controls for personal data",
                        "Document access control policies",
                        "Train staff on data protection",
                        "Monitor access to personal data"
                    ],
                    audit="Review access control implementation and audit trails"
                )
            ],
            keywords=["authorization", "permission", "access", "rbac", "privilege"]
        )

        # OWASP A02: Cryptographic Failures
        self.issue_mappings["OWASP-A02"] = IssueMapping(
            issue_type="OWASP-A02",
            issue_name="Cryptographic Failures",
            risk_level=RiskLevel.CRITICAL,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="3, 4",
                    name="Encryption (Requirements 3, 4)",
                    desc="Encrypt stored data and data in transit",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Use TLS 1.2+ for data in transit",
                        "Encrypt payment cards at rest (AES-256+)",
                        "Use strong encryption algorithms",
                        "Manage encryption keys securely"
                    ],
                    audit="Verify TLS versions; check encryption algorithms; review key management"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures - Encryption",
                    desc="Use encryption to protect personal data",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["pii", "health", "financial"],
                    steps=[
                        "Implement end-to-end encryption for sensitive data",
                        "Use strong encryption standards",
                        "Document encryption policies",
                        "Maintain encryption key inventory"
                    ],
                    audit="Review encryption implementation; verify key management practices"
                )
            ],
            keywords=["encryption", "tls", "ssl", "cipher", "https", "crypto"]
        )

        # OWASP A03: Injection
        self.issue_mappings["OWASP-A03"] = IssueMapping(
            issue_type="OWASP-A03",
            issue_name="Injection Attacks",
            risk_level=RiskLevel.CRITICAL,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="6",
                    name="Secure Development (Requirement 6)",
                    desc="Develop secure applications",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Use parameterized queries",
                        "Validate and sanitize input",
                        "Implement SQL injection prevention",
                        "Code review for injection vulnerabilities"
                    ],
                    audit="Review code for injection prevention; verify input validation"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures - Application Security",
                    desc="Implement secure application development",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["pii", "health"],
                    steps=[
                        "Implement input validation",
                        "Use parameterized queries",
                        "Code review and testing",
                        "Security training for developers"
                    ],
                    audit="Review SAST results; verify input validation; check code reviews"
                )
            ],
            keywords=["injection", "sql", "command", "ldap", "malicious input"]
        )

        # OWASP A04: Insecure Design
        self.issue_mappings["OWASP-A04"] = IssueMapping(
            issue_type="OWASP-A04",
            issue_name="Insecure Design",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="6",
                    name="Secure Architecture (Requirement 6)",
                    desc="Design systems with security in mind",
                    level=ComplianceLevel.SHOULD_FIX,
                    data_types=["payment_cards"],
                    steps=[
                        "Threat modeling for new applications",
                        "Security design review",
                        "Implement security controls",
                        "Document security architecture"
                    ],
                    audit="Review threat models; verify design controls; check documentation"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 25",
                    name="Data Protection by Design and Default",
                    desc="Implement data protection in design phase",
                    level=ComplianceLevel.SHOULD_FIX,
                    data_types=["pii", "health"],
                    steps=[
                        "Data protection impact assessment (DPIA)",
                        "Privacy controls from design phase",
                        "Privacy-preserving techniques",
                        "Regular architecture reviews"
                    ],
                    audit="Review DPIA; verify privacy controls; check design reviews"
                )
            ],
            keywords=["design", "architecture", "secure design", "threat model"]
        )

        # OWASP A05: Security Misconfiguration
        self.issue_mappings["OWASP-A05"] = IssueMapping(
            issue_type="OWASP-A05",
            issue_name="Security Misconfiguration",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="2",
                    name="Default Configuration (Requirement 2)",
                    desc="Do not use security parameters with vendor defaults",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Change all default passwords",
                        "Disable unnecessary services",
                        "Remove default accounts",
                        "Configure hardened baselines"
                    ],
                    audit="Verify no default credentials; check service configurations"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures - Configuration",
                    desc="Ensure secure configuration",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["pii"],
                    steps=[
                        "Apply hardened configuration baselines",
                        "Regular configuration audits",
                        "Document configuration standards",
                        "Change default settings"
                    ],
                    audit="Review configuration standards; verify hardening; audit trail"
                )
            ],
            keywords=["misconfiguration", "default", "configuration", "hardening"]
        )

        # OWASP A06: Vulnerable Components
        self.issue_mappings["OWASP-A06"] = IssueMapping(
            issue_type="OWASP-A06",
            issue_name="Vulnerable and Outdated Components",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="6",
                    name="Vulnerability Management (Requirement 6)",
                    desc="Protect systems from known vulnerabilities",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Maintain inventory of components",
                        "Apply security patches monthly",
                        "Remove unsupported software",
                        "Test patches before deployment"
                    ],
                    audit="Verify patch management process; check component inventory"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures - Updates",
                    desc="Maintain up-to-date systems",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["pii"],
                    steps=[
                        "Maintain software inventory",
                        "Apply patches timely",
                        "Monitor for vulnerabilities",
                        "Test updates before deployment"
                    ],
                    audit="Check patch history; verify inventory; monitor CVEs"
                )
            ],
            keywords=["vulnerable", "outdated", "component", "dependency", "patch"]
        )

        # OWASP A07: Authentication Failure
        self.issue_mappings["OWASP-A07"] = IssueMapping(
            issue_type="OWASP-A07",
            issue_name="Authentication and Session Management Failures",
            risk_level=RiskLevel.CRITICAL,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="8",
                    name="Authentication (Requirement 8)",
                    desc="Restrict access through authentication",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Enforce unique user IDs",
                        "Require strong passwords",
                        "Implement multi-factor authentication",
                        "Manage session timeouts"
                    ],
                    audit="Verify MFA; check password policy; review session management"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures - Authentication",
                    desc="Use strong authentication mechanisms",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["pii", "health"],
                    steps=[
                        "Implement strong authentication",
                        "Require multi-factor authentication",
                        "Manage session security",
                        "Monitor authentication attempts"
                    ],
                    audit="Verify MFA configuration; check authentication logs"
                )
            ],
            keywords=["authentication", "session", "password", "mfa", "login"]
        )

        # OWASP A08: Software and Data Integrity Failures
        self.issue_mappings["OWASP-A08"] = IssueMapping(
            issue_type="OWASP-A08",
            issue_name="Software and Data Integrity Failures",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="6",
                    name="Secure Development (Requirement 6)",
                    desc="Secure software development",
                    level=ComplianceLevel.SHOULD_FIX,
                    data_types=["payment_cards"],
                    steps=[
                        "Implement code signing",
                        "Secure build pipeline",
                        "Software bill of materials (SBOM)",
                        "Integrity verification"
                    ],
                    audit="Verify code signing; review build controls; check SBOM"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures - Integrity",
                    desc="Maintain data and software integrity",
                    level=ComplianceLevel.SHOULD_FIX,
                    data_types=["pii"],
                    steps=[
                        "Implement integrity checks",
                        "Secure deployment process",
                        "Monitor data modifications",
                        "Maintain audit trails"
                    ],
                    audit="Review integrity mechanisms; check audit logs"
                )
            ],
            keywords=["integrity", "tamper", "compromise", "data tampering"]
        )

        # OWASP A09: Logging and Monitoring Failures
        self.issue_mappings["OWASP-A09"] = IssueMapping(
            issue_type="OWASP-A09",
            issue_name="Logging and Monitoring Failures",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="10, 11",
                    name="Logging and Monitoring (Requirements 10, 11)",
                    desc="Maintain and monitor logs",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards"],
                    steps=[
                        "Log all access to cardholder data",
                        "Retain logs for minimum 1 year",
                        "Monitor logs for suspicious activity",
                        "Review logs at least daily"
                    ],
                    audit="Verify logging enabled; check log retention; review monitoring"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32, 33",
                    name="Logging and Breach Notification",
                    desc="Maintain logs and notify breaches",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["pii", "health"],
                    steps=[
                        "Log all data access",
                        "Monitor for unauthorized access",
                        "Maintain breach log",
                        "Notify authorities within 72 hours"
                    ],
                    audit="Check access logs; verify breach procedure; audit trail"
                )
            ],
            keywords=["logging", "monitoring", "audit", "log", "detection"]
        )

        # OWASP A10: Server-Side Request Forgery
        self.issue_mappings["OWASP-A10"] = IssueMapping(
            issue_type="OWASP-A10",
            issue_name="Server-Side Request Forgery (SSRF)",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="1, 6",
                    name="Network Controls (Requirements 1, 6)",
                    desc="Restrict network access",
                    level=ComplianceLevel.SHOULD_FIX,
                    data_types=["payment_cards"],
                    steps=[
                        "Validate URL inputs",
                        "Implement network segmentation",
                        "Whitelist allowed destinations",
                        "Monitor outbound connections"
                    ],
                    audit="Review network policies; verify URL validation; check logs"
                ),
                self._create_requirement(
                    framework=ComplianceFramework.GDPR,
                    req_id="Article 32",
                    name="Security Measures - Network Protection",
                    desc="Protect network from unauthorized access",
                    level=ComplianceLevel.SHOULD_FIX,
                    data_types=["pii"],
                    steps=[
                        "Implement network segmentation",
                        "Use firewalls",
                        "Validate external requests",
                        "Monitor network traffic"
                    ],
                    audit="Review network architecture; verify controls"
                )
            ],
            keywords=["ssrf", "request forgery", "internal", "private network"]
        )

        # Additional CWE mappings for common issues
        self._add_cwe_mappings()

    def _add_cwe_mappings(self) -> None:
        """Add CWE-specific mappings."""
        
        # CWE-79: Cross-site Scripting (XSS)
        self.issue_mappings["CWE-79"] = IssueMapping(
            issue_type="CWE-79",
            issue_name="Improper Neutralization of Input During Web Page Generation",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="6",
                    name="Secure Applications (Requirement 6)",
                    desc="Prevent XSS vulnerabilities",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Encode output properly",
                        "Implement CSP headers",
                        "Use templating engines safely",
                        "Input validation and sanitization"
                    ],
                    audit="Review code for XSS; verify CSP headers; check SAST results"
                )
            ],
            keywords=["xss", "cross-site scripting", "script injection"]
        )

        # CWE-89: SQL Injection
        self.issue_mappings["CWE-89"] = IssueMapping(
            issue_type="CWE-89",
            issue_name="SQL Injection",
            risk_level=RiskLevel.CRITICAL,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="6",
                    name="Secure Applications (Requirement 6)",
                    desc="Prevent SQL injection",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards", "pii"],
                    steps=[
                        "Use parameterized queries",
                        "Use prepared statements",
                        "Input validation",
                        "Principle of least privilege for DB"
                    ],
                    audit="Code review; verify parameterized queries; SAST testing"
                )
            ],
            keywords=["sql injection", "database attack"]
        )

        # CWE-384: Session Fixation
        self.issue_mappings["CWE-384"] = IssueMapping(
            issue_type="CWE-384",
            issue_name="Session Fixation",
            risk_level=RiskLevel.HIGH,
            requirements=[
                self._create_requirement(
                    framework=ComplianceFramework.PCI_DSS_V4,
                    req_id="8",
                    name="Authentication (Requirement 8)",
                    desc="Secure session management",
                    level=ComplianceLevel.MUST_FIX,
                    data_types=["payment_cards"],
                    steps=[
                        "Regenerate session IDs after login",
                        "Use secure session cookies",
                        "HTTP-only flag on cookies",
                        "Secure flag on HTTPS connections"
                    ],
                    audit="Verify session ID handling; check cookie attributes"
                )
            ],
            keywords=["session fixation", "session management"]
        )

    @staticmethod
    def _create_requirement(
        framework: ComplianceFramework,
        req_id: str,
        name: str,
        desc: str,
        level: ComplianceLevel,
        data_types: List[str],
        steps: List[str],
        audit: str
    ) -> ComplianceRequirement:
        """Create a compliance requirement."""
        return ComplianceRequirement(
            framework=framework.value,
            requirement_id=req_id,
            requirement_name=name,
            description=desc,
            level=level,
            affected_data_types=data_types,
            remediation_steps=steps,
            audit_guidance=audit
        )

    def map_issue_to_requirements(
        self,
        issue_type: str,
        **kwargs
    ) -> Optional[IssueMapping]:
        """Get compliance requirements for an issue."""
        return self.issue_mappings.get(issue_type)

    def risk_level_to_compliance_level(
        self,
        risk_level: RiskLevel
    ) -> ComplianceLevel:
        """Map risk level to compliance action level."""
        mapping = {
            RiskLevel.CRITICAL: ComplianceLevel.MUST_FIX,
            RiskLevel.HIGH: ComplianceLevel.SHOULD_FIX,
            RiskLevel.MEDIUM: ComplianceLevel.MAY_FIX,
            RiskLevel.LOW: ComplianceLevel.RECOMMENDED,
            RiskLevel.INFO: ComplianceLevel.RECOMMENDED,
        }
        return mapping.get(risk_level, ComplianceLevel.RECOMMENDED)

    def search_mappings(self, keyword: str) -> List[IssueMapping]:
        """Search issue mappings by keyword."""
        keyword = keyword.lower()
        results = []
        for mapping in self.issue_mappings.values():
            if (keyword in mapping.issue_name.lower() or 
                keyword in mapping.issue_type.lower() or
                any(keyword in k.lower() for k in mapping.keywords)):
                results.append(mapping)
        return results

    def get_all_frameworks_for_issue(
        self,
        issue_type: str
    ) -> Dict[str, List[ComplianceRequirement]]:
        """Get requirements for issue grouped by framework."""
        mapping = self.issue_mappings.get(issue_type)
        if not mapping:
            return {}
        
        grouped = {}
        for req in mapping.requirements:
            framework = req.framework
            if framework not in grouped:
                grouped[framework] = []
            grouped[framework].append(req)
        return grouped

    def get_requirements_by_framework(
        self,
        framework: ComplianceFramework
    ) -> Dict[str, ComplianceRequirement]:
        """Get all requirements for a framework."""
        result = {}
        for mapping in self.issue_mappings.values():
            for req in mapping.requirements:
                if req.framework == framework.value:
                    result[req.requirement_id] = req
        return result

    def assess_compliance_status(
        self,
        issues: List[Dict]  # List of {type, risk_level, ...}
    ) -> Dict:
        """Assess overall compliance status from security issues."""
        unmapped_issues = []
        mapped_requirements = {}
        critical_issues = []

        for issue in issues:
            issue_type = issue.get("type")
            risk_level = RiskLevel(issue.get("risk_level", "info"))

            mapping = self.map_issue_to_requirements(issue_type)
            
            if not mapping:
                unmapped_issues.append(issue)
                continue

            if risk_level == RiskLevel.CRITICAL:
                critical_issues.append(issue)

            comp_level = self.risk_level_to_compliance_level(risk_level)
            
            for req in mapping.requirements:
                key = f"{req.framework}:{req.requirement_id}"
                if key not in mapped_requirements:
                    mapped_requirements[key] = {
                        "requirement": req,
                        "issues": []
                    }
                mapped_requirements[key]["issues"].append(issue)

        # Calculate compliance percentage
        total_requirements = len(self.issue_mappings) * 2  # PCI + GDPR roughly
        compliant = total_requirements - len(mapped_requirements)
        compliance_percentage = max(0, (compliant / total_requirements) * 100) if total_requirements > 0 else 0

        return {
            "overall_compliance_percentage": round(compliance_percentage, 1),
            "mapped_requirements": mapped_requirements,
            "unmapped_issues": unmapped_issues,
            "critical_issues": critical_issues,
            "total_issues": len(issues),
            "unique_requirements_affected": len(mapped_requirements),
            "assessment_timestamp": datetime.utcnow().isoformat()
        }

    def generate_compliance_summary(
        self,
        assessment: Dict
    ) -> str:
        """Generate human-readable compliance summary."""
        summary = f"""
COMPLIANCE ASSESSMENT SUMMARY
============================

Assessment Date: {assessment['assessment_timestamp']}

Overall Compliance: {assessment['overall_compliance_percentage']}%
Total Issues: {assessment['total_issues']}
Critical Issues: {len(assessment['critical_issues'])}
Requirements Affected: {assessment['unique_requirements_affected']}

Status:
  - {'🔴 NON-COMPLIANT' if assessment['overall_compliance_percentage'] < 50 else '🟡 PARTIALLY COMPLIANT' if assessment['overall_compliance_percentage'] < 90 else '🟢 COMPLIANT'}
  - Critical Requirements: {len([r for r in assessment['mapped_requirements'].values() if r['requirement'].level == ComplianceLevel.MUST_FIX])}
  - High Requirements: {len([r for r in assessment['mapped_requirements'].values() if r['requirement'].level == ComplianceLevel.SHOULD_FIX])}

Required Actions:
  1. Address all CRITICAL issues immediately
  2. Fix HIGH issues within 30 days
  3. Remediate MEDIUM issues within 90 days
  4. Implement RECOMMENDED best practices

Audit Trail:
  - Generated: {datetime.utcnow().isoformat()}
  - Framework: PCI DSS v4.0, GDPR
  - Assessment Type: Automated security issue mapping
        """
        return summary


# Global mapper instance
_mapper = None


def get_mapper() -> ComplianceMapper:
    """Get or create global compliance mapper."""
    global _mapper
    if _mapper is None:
        _mapper = ComplianceMapper()
    return _mapper
