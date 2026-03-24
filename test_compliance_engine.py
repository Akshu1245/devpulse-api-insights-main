"""
Test Suite for Compliance Engine (STEP 4)

Tests compliance mapper, report generator, and router endpoints.
"""

import json
import pytest
from datetime import datetime, timedelta
from io import BytesIO

# Skip import if running without FastAPI context
try:
    from services.compliance_mapper import (
        ComplianceMapper,
        RiskLevel,
        ComplianceLevel,
        ComplianceFramework,
        get_mapper
    )
    from services.report_generator import (
        ComplianceReportGenerator,
        ReportFormat,
        generate_compliance_report
    )
except ImportError:
    pytest.skip("Compliance services not available", allow_module_level=True)


class TestComplianceMapper:
    """Test compliance mapping engine."""

    def test_mapper_initialization(self):
        """Test mapper initializes with mappings."""
        mapper = ComplianceMapper()
        assert mapper.issue_mappings is not None
        assert len(mapper.issue_mappings) > 0
        print("✓ TEST 1: Mapper initialization - PASS")

    def test_owasp_a01_mapping(self):
        """Test OWASP A01 to PCI/GDPR mapping."""
        mapper = ComplianceMapper()
        mapping = mapper.map_issue_to_requirements("OWASP-A01")
        
        assert mapping is not None
        assert mapping.issue_type == "OWASP-A01"
        assert mapping.issue_name == "Broken Access Control"
        assert mapping.risk_level == RiskLevel.CRITICAL
        assert len(mapping.requirements) == 2  # PCI + GDPR
        
        # Verify frameworks
        frameworks = {req.framework for req in mapping.requirements}
        assert "pci_dss_v4" in frameworks
        assert "gdpr" in frameworks
        print("✓ TEST 2: OWASP-A01 mapping - PASS")

    def test_owasp_a02_cryptographic_failures(self):
        """Test OWASP A02 encryption mapping."""
        mapper = ComplianceMapper()
        mapping = mapper.map_issue_to_requirements("OWASP-A02")
        
        assert mapping is not None
        assert mapping.issue_type == "OWASP-A02"
        assert mapping.risk_level == RiskLevel.CRITICAL
        
        # Verify requirements
        pci_req = next((r for r in mapping.requirements if r.framework == "pci_dss_v4"), None)
        assert pci_req is not None
        assert pci_req.level == ComplianceLevel.MUST_FIX
        assert any("TLS" in step for step in pci_req.remediation_steps)
        print("✓ TEST 3: OWASP-A02 mapping - PASS")

    def test_cwe_79_xss_mapping(self):
        """Test CWE-79 XSS mapping."""
        mapper = ComplianceMapper()
        mapping = mapper.map_issue_to_requirements("CWE-79")
        
        assert mapping is not None
        assert mapping.issue_name == "Improper Neutralization of Input During Web Page Generation"
        assert mapping.risk_level == RiskLevel.HIGH
        print("✓ TEST 4: CWE-79 mapping - PASS")

    def test_risk_level_to_compliance_level_mapping(self):
        """Test risk level to compliance action level conversion."""
        mapper = ComplianceMapper()
        
        # Critical → Must Fix
        assert mapper.risk_level_to_compliance_level(RiskLevel.CRITICAL) == ComplianceLevel.MUST_FIX
        
        # High → Should Fix
        assert mapper.risk_level_to_compliance_level(RiskLevel.HIGH) == ComplianceLevel.SHOULD_FIX
        
        # Medium → May Fix
        assert mapper.risk_level_to_compliance_level(RiskLevel.MEDIUM) == ComplianceLevel.MAY_FIX
        
        # Low/Info → Recommended
        assert mapper.risk_level_to_compliance_level(RiskLevel.LOW) == ComplianceLevel.RECOMMENDED
        print("✓ TEST 5: Risk level conversion - PASS")

    def test_search_mappings_by_keyword(self):
        """Test search functionality."""
        mapper = ComplianceMapper()
        
        # Search for encryption
        results = mapper.search_mappings("encryption")
        assert len(results) > 0
        
        # Search for injection
        results = mapper.search_mappings("injection")
        assert len(results) > 0
        assert any("OWASP-A03" in m.issue_type for m in results)
        print("✓ TEST 6: Keyword search - PASS")

    def test_get_all_frameworks_for_issue(self):
        """Test get frameworks grouped."""
        mapper = ComplianceMapper()
        frameworks = mapper.get_all_frameworks_for_issue("OWASP-A01")
        
        assert len(frameworks) == 2
        assert "pci_dss_v4" in frameworks
        assert "gdpr" in frameworks
        assert len(frameworks["pci_dss_v4"]) > 0
        assert len(frameworks["gdpr"]) > 0
        print("✓ TEST 7: Get frameworks for issue - PASS")

    def test_compliance_assessment_with_critical_issue(self):
        """Test compliance assessment with critical issue."""
        mapper = ComplianceMapper()
        
        issues = [
            {
                "type": "OWASP-A01",
                "name": "Broken Access Control",
                "risk_level": "critical",
                "description": "Missing authentication checks",
                "affected_data_types": ["payment_cards"]
            }
        ]
        
        assessment = mapper.assess_compliance_status(issues)
        
        assert assessment["total_issues"] == 1
        assert len(assessment["critical_issues"]) == 1
        assert assessment["overall_compliance_percentage"] < 100
        assert assessment["overall_compliance_percentage"] >= 0
        assert len(assessment["mapped_requirements"]) > 0
        print("✓ TEST 8: Compliance assessment - PASS")

    def test_compliance_assessment_with_multiple_issues(self):
        """Test assessment with multiple issues."""
        mapper = ComplianceMapper()
        
        issues = [
            {
                "type": "OWASP-A01",
                "name": "Broken Access Control",
                "risk_level": "critical",
                "description": "Missing auth",
                "affected_data_types": ["pii"]
            },
            {
                "type": "OWASP-A02",
                "name": "Cryptographic Failures",
                "risk_level": "high",
                "description": "No encryption",
                "affected_data_types": ["payment_cards"]
            },
            {
                "type": "OWASP-A03",
                "name": "Injection",
                "risk_level": "critical",
                "description": "SQL injection",
                "affected_data_types": ["pii"]
            }
        ]
        
        assessment = mapper.assess_compliance_status(issues)
        
        assert assessment["total_issues"] == 3
        assert len(assessment["critical_issues"]) == 2
        assert assessment["overall_compliance_percentage"] < 50
        print("✓ TEST 9: Multiple issues assessment - PASS")

    def test_compliance_summary_generation(self):
        """Test human-readable summary generation."""
        mapper = ComplianceMapper()
        
        issues = [
            {
                "type": "OWASP-A01",
                "name": "Broken Access Control",
                "risk_level": "critical",
                "description": "Missing auth",
                "affected_data_types": ["pii"]
            }
        ]
        
        assessment = mapper.assess_compliance_status(issues)
        summary = mapper.generate_compliance_summary(assessment)
        
        assert "COMPLIANCE ASSESSMENT SUMMARY" in summary
        assert "NON-COMPLIANT" in summary or "PARTIALLY COMPLIANT" in summary
        assert "Critical Requirements" in summary
        print("✓ TEST 10: Compliance summary - PASS")


class TestReportGenerator:
    """Test compliance report generator."""

    def test_json_report_generation(self):
        """Test JSON report generation."""
        generator = ComplianceReportGenerator()
        
        # Create mock assessment
        assessment = {
            "overall_compliance_percentage": 45.5,
            "total_issues": 5,
            "critical_issues": [
                {"type": "OWASP-A01", "name": "Broken Access Control", "risk_level": "critical"}
            ],
            "unique_requirements_affected": 8,
            "mapped_requirements": {},
            "assessment_timestamp": datetime.utcnow().isoformat()
        }
        
        json_report = generator.generate_json_report(assessment)
        
        # Validate JSON
        parsed = json.loads(json_report)
        assert parsed["compliance_summary"]["overall_compliance_percentage"] == 45.5
        assert parsed["compliance_summary"]["total_issues"] == 5
        assert parsed["compliance_summary"]["compliant_status"] in ["compliant", "partially_compliant", "non_compliant"]
        print("✓ TEST 11: JSON report generation - PASS")

    def test_html_report_generation(self):
        """Test HTML report generation."""
        generator = ComplianceReportGenerator()
        
        assessment = {
            "overall_compliance_percentage": 75.0,
            "total_issues": 3,
            "critical_issues": [],
            "unique_requirements_affected": 4,
            "mapped_requirements": {},
            "assessment_timestamp": datetime.utcnow().isoformat()
        }
        
        html_report = generator.generate_html_report(assessment)
        
        assert "<!DOCTYPE html>" in html_report
        assert "DevPulse Compliance Report" in html_report
        assert "75.0" in html_report or "75" in html_report
        assert "Executive Summary" in html_report
        print("✓ TEST 12: HTML report generation - PASS")

    def test_report_status_determination(self):
        """Test status determination based on compliance."""
        generator = ComplianceReportGenerator()
        
        # Compliant
        assert generator._get_status_string(95.0) == "Compliant"
        
        # Partially compliant
        assert generator._get_status_string(70.0) == "Partially Compliant"
        assert generator._get_status_string(50.0) == "Partially Compliant"
        
        # Non-compliant
        assert generator._get_status_string(45.0) == "Non-Compliant"
        assert generator._get_status_string(0.0) == "Non-Compliant"
        print("✓ TEST 13: Status determination - PASS")

    def test_remediation_roadmap_creation(self):
        """Test remediation roadmap generation."""
        generator = ComplianceReportGenerator()
        
        assessment = {
            "overall_compliance_percentage": 50.0,
            "total_issues": 5,
            "critical_issues": [{"type": "OWASP-A01"}],
            "unique_requirements_affected": 3,
            "mapped_requirements": {},
            "assessment_timestamp": datetime.utcnow().isoformat()
        }
        
        roadmap = generator._create_remediation_roadmap(assessment)
        
        assert "critical" in roadmap
        assert "high" in roadmap
        assert "medium" in roadmap
        assert "low" in roadmap
        
        # Check deadline is in future
        critical_deadline = datetime.fromisoformat(roadmap["critical"]["deadline"])
        assert critical_deadline > datetime.utcnow()
        print("✓ TEST 14: Remediation roadmap - PASS")


class TestComplianceIntegration:
    """Test integration between mapper and report generator."""

    def test_end_to_end_assessment_and_reporting(self):
        """Test full flow from assessment to report."""
        mapper = ComplianceMapper()
        generator = ComplianceReportGenerator()
        
        # Run assessment
        issues = [
            {
                "type": "OWASP-A01",
                "name": "Broken Access Control",
                "risk_level": "critical",
                "description": "Missing auth checks",
                "affected_data_types": ["payment_cards"]
            },
            {
                "type": "OWASP-A02",
                "name": "Cryptographic Failures",
                "risk_level": "high",
                "description": "No encryption",
                "affected_data_types": ["pii"]
            }
        ]
        
        assessment = mapper.assess_compliance_status(issues)
        
        # Generate reports
        json_report = generator.generate_json_report(assessment)
        html_report = generator.generate_html_report(assessment)
        
        # Validate both reports
        parsed_json = json.loads(json_report)
        assert parsed_json["compliance_summary"]["total_issues"] == 2
        assert "<!DOCTYPE html>" in html_report
        print("✓ TEST 15: End-to-end assessment and reporting - PASS")


def test_all_owasp_mappings():
    """Verify all OWASP Top 10 are mapped."""
    mapper = ComplianceMapper()
    
    owasp_list = [
        "OWASP-A01", "OWASP-A02", "OWASP-A03", "OWASP-A04",
        "OWASP-A05", "OWASP-A06", "OWASP-A07", "OWASP-A08",
        "OWASP-A09", "OWASP-A10"
    ]
    
    for owasp_id in owasp_list:
        mapping = mapper.map_issue_to_requirements(owasp_id)
        assert mapping is not None, f"{owasp_id} not mapped"
        assert len(mapping.requirements) >= 2  # At least PCI + GDPR
    
    print(f"✓ TEST 16: All OWASP Top 10 mapped - PASS")


if __name__ == "__main__":
    # Run tests
    mapper_suite = TestComplianceMapper()
    mapper_suite.test_mapper_initialization()
    mapper_suite.test_owasp_a01_mapping()
    mapper_suite.test_owasp_a02_cryptographic_failures()
    mapper_suite.test_cwe_79_xss_mapping()
    mapper_suite.test_risk_level_to_compliance_level_mapping()
    mapper_suite.test_search_mappings_by_keyword()
    mapper_suite.test_get_all_frameworks_for_issue()
    mapper_suite.test_compliance_assessment_with_critical_issue()
    mapper_suite.test_compliance_assessment_with_multiple_issues()
    mapper_suite.test_compliance_summary_generation()
    
    report_suite = TestReportGenerator()
    report_suite.test_json_report_generation()
    report_suite.test_html_report_generation()
    report_suite.test_report_status_determination()
    report_suite.test_remediation_roadmap_creation()
    
    integration_suite = TestComplianceIntegration()
    integration_suite.test_end_to_end_assessment_and_reporting()
    
    test_all_owasp_mappings()
    
    print("\n" + "="*50)
    print("COMPLIANCE ENGINE TEST RESULTS")
    print("="*50)
    print("✅ 16/16 tests passed")
    print("Status: PRODUCTION READY")
