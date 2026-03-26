"""
Comprehensive Compliance Mapping Dictionary
OWASP API Security Top 10 (2023) → PCI DSS v4.0.1 + GDPR Articles

DevPulse Patent 4 — Automated Compliance Evidence Generation
"""

from __future__ import annotations

from typing import Any

# ──────────────────────────────────────────────────────────────────────────────
# OWASP API Security Top 10 (2023) → PCI DSS v4.0.1 Requirements
# ──────────────────────────────────────────────────────────────────────────────

OWASP_PCI_DSS_MAPPING: dict[str, dict[str, Any]] = {
    # ── API1:2023 — Broken Object Level Authorization (BOLA) ──────────────
    "API1:2023": {
        "owasp_name": "Broken Object Level Authorization",
        "description": "Attackers exploit endpoints by manipulating object IDs to access resources belonging to other users.",
        "pci_requirements": [
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of security vulnerabilities",
                "description": "BOLA vulnerabilities arise from missing object-level access control checks. PCI DSS 6.2.4 mandates secure coding practices that prevent authorization bypass in all custom code.",
                "status_if_found": "FAIL",
                "remediation": "Implement server-side authorization checks on every API endpoint. Validate the authenticated user has permission to access the specific resource object. Use ABAC or RBAC policies consistently.",
            },
            {
                "id": "6.3.1",
                "title": "Security vulnerabilities are identified and addressed",
                "description": "BOLA must be detected through security testing (DAST/SAST) and remediated before deployment to production.",
                "status_if_found": "FAIL",
                "remediation": "Add automated BOLA testing to CI/CD pipeline. Scan every pull request for object-level authorization gaps.",
            },
            {
                "id": "7.2.1",
                "title": "Access is granted on a need-to-know basis",
                "description": "BOLA directly violates the need-to-know principle by allowing unauthorized access to objects outside the user's scope.",
                "status_if_found": "FAIL",
                "remediation": "Enforce least-privilege access. Map every API endpoint to required roles. Verify ownership before returning resources.",
            },
        ],
        "gdpr_articles": [
            "Article 5(1)(f) — Integrity and Confidentiality",
            "Article 25 — Data Protection by Design and by Default",
            "Article 32 — Security of Processing",
        ],
    },
    # ── API2:2023 — Broken Authentication ─────────────────────────────────
    "API2:2023": {
        "owasp_name": "Broken Authentication",
        "description": "Authentication mechanisms are implemented incorrectly, allowing attackers to compromise tokens or exploit flaws to assume other users' identities.",
        "pci_requirements": [
            {
                "id": "8.2.1",
                "title": "All user IDs and authentication credentials are managed",
                "description": "Broken authentication allows attackers to compromise authentication tokens or exploit implementation flaws to hijack sessions.",
                "status_if_found": "FAIL",
                "remediation": "Implement strong authentication mechanisms. Use short-lived JWTs with rotation. Enforce MFA for privileged accounts. Implement account lockout after failed attempts.",
            },
            {
                "id": "8.3.1",
                "title": "All user access to system components is authenticated",
                "description": "Every API endpoint must require proper authentication. No endpoint should be accessible without valid credentials.",
                "status_if_found": "FAIL",
                "remediation": "Audit all API endpoints for authentication requirements. Remove public access to internal APIs. Implement API gateway authentication.",
            },
            {
                "id": "8.3.6",
                "title": "Minimum password complexity and strength",
                "description": "Weak password policies enable brute-force attacks against API authentication endpoints.",
                "status_if_found": "FAIL",
                "remediation": "Enforce minimum 12-character passwords with complexity requirements. Implement credential stuffing protection.",
            },
            {
                "id": "8.4.1",
                "title": "MFA for all non-console administrative access",
                "description": "Administrative API access without MFA is a critical vulnerability.",
                "status_if_found": "FAIL",
                "remediation": "Implement MFA for all administrative and privileged API access. Use hardware tokens or TOTP.",
            },
        ],
        "gdpr_articles": [
            "Article 32(1)(b) — Ongoing confidentiality, integrity, availability",
            "Article 32(1)(d) — Processes for regularly testing security",
        ],
    },
    # ── API3:2023 — Broken Object Property Level Authorization ────────────
    "API3:2023": {
        "owasp_name": "Broken Object Property Level Authorization",
        "description": "Attackers exploit endpoints by viewing or modifying object properties they should not have access to. Includes Mass Assignment and Excessive Data Exposure.",
        "pci_requirements": [
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of security vulnerabilities",
                "description": "Mass assignment and excessive data exposure violate secure coding practices by exposing more data than the client needs.",
                "status_if_found": "FAIL",
                "remediation": "Use DTOs (Data Transfer Objects) with allowlists for every API endpoint. Never bind request bodies directly to internal models. Strip sensitive fields from responses.",
            },
            {
                "id": "7.2.1",
                "title": "Access is granted on a need-to-know basis",
                "description": "Exposing object properties beyond the user's authorization level violates need-to-know access control.",
                "status_if_found": "FAIL",
                "remediation": "Implement field-level authorization. Define per-role field access policies. Validate all input properties against schema.",
            },
            {
                "id": "3.4.1",
                "title": "PAN is secured wherever it is stored",
                "description": "If cardholder data properties are exposed through API responses, PAN data may leak to unauthorized consumers.",
                "status_if_found": "FAIL",
                "remediation": "Mask PAN in all API responses. Use tokenization for card data. Audit all endpoints that return payment-related objects.",
            },
        ],
        "gdpr_articles": [
            "Article 5(1)(c) — Data Minimisation",
            "Article 5(1)(f) — Integrity and Confidentiality",
            "Article 25 — Data Protection by Design and by Default",
        ],
    },
    # ── API4:2023 — Unrestricted Resource Consumption ─────────────────────
    "API4:2023": {
        "owasp_name": "Unrestricted Resource Consumption",
        "description": "API requests consume resources like network bandwidth, CPU, memory, or storage without limits, enabling denial of service attacks.",
        "pci_requirements": [
            {
                "id": "6.4.1",
                "title": "Public-facing web applications are protected against attacks",
                "description": "Unrestricted resource consumption leads to denial of service, directly impacting payment processing availability and system integrity.",
                "status_if_found": "FAIL",
                "remediation": "Implement rate limiting per user, per IP, and per endpoint. Set maximum request/response sizes. Implement request queuing for expensive operations.",
            },
            {
                "id": "10.4.1",
                "title": "Audit logs are reviewed to identify anomalies",
                "description": "Resource exhaustion attacks generate distinctive traffic patterns that should trigger alerts.",
                "status_if_found": "WARN",
                "remediation": "Implement anomaly detection for request volume. Alert on unusual resource consumption patterns. Log rate limit violations.",
            },
            {
                "id": "11.3.1",
                "title": "Vulnerabilities are managed by risk ranking",
                "description": "Denial of service risk must be assessed and prioritized in vulnerability management.",
                "status_if_found": "WARN",
                "remediation": "Include DoS resilience in vulnerability assessments. Test API endpoints for resource consumption limits.",
            },
        ],
        "gdpr_articles": [
            "Article 32(1)(b) — Ongoing confidentiality, integrity, availability",
            "Article 32(1)(c) — Ability to restore availability after incident",
        ],
    },
    # ── API5:2023 — Broken Function Level Authorization (BFLA) ────────────
    "API5:2023": {
        "owasp_name": "Broken Function Level Authorization",
        "description": "Attackers exploit administrative API endpoints by sending legitimate API calls to functions they should not have access to.",
        "pci_requirements": [
            {
                "id": "7.2.1",
                "title": "Access is granted on a need-to-know basis",
                "description": "BFLA allows regular users to invoke administrative functions, directly violating need-to-know access control.",
                "status_if_found": "FAIL",
                "remediation": "Implement role-based access control (RBAC) at the function level. Deny by default. Verify caller role before executing any administrative operation.",
            },
            {
                "id": "7.2.2",
                "title": "Access to system components is assigned based on job function",
                "description": "Administrative API functions must be restricted to users with appropriate job functions.",
                "status_if_found": "FAIL",
                "remediation": "Define explicit role-to-function mappings. Remove admin endpoints from public API documentation. Implement API gateway policies.",
            },
            {
                "id": "7.2.5",
                "title": "All access is authorized and authenticated",
                "description": "Every function-level operation must verify both authentication and authorization.",
                "status_if_found": "FAIL",
                "remediation": "Add authorization middleware to all admin routes. Implement function-level permission checks. Log all unauthorized access attempts.",
            },
        ],
        "gdpr_articles": [
            "Article 5(1)(f) — Integrity and Confidentiality",
            "Article 25 — Data Protection by Design and by Default",
            "Article 32 — Security of Processing",
        ],
    },
    # ── API6:2023 — Unrestricted Access to Sensitive Business Flows ───────
    "API6:2023": {
        "owasp_name": "Unrestricted Access to Sensitive Business Flows",
        "description": "Attackers exploit business logic flows by automating legitimate API calls to cause harm (e.g., ticket scalping, inventory hoarding).",
        "pci_requirements": [
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of security vulnerabilities",
                "description": "Business logic abuse is a design-level vulnerability that must be prevented through secure design practices.",
                "status_if_found": "FAIL",
                "remediation": "Implement CAPTCHA or proof-of-work for sensitive flows. Add device fingerprinting. Detect automation patterns. Limit transaction velocity.",
            },
            {
                "id": "6.4.1",
                "title": "Public-facing web applications are protected against attacks",
                "description": "Business logic abuse can result in financial loss through automated exploitation of payment and transaction flows.",
                "status_if_found": "FAIL",
                "remediation": "Implement WAF rules for automation detection. Add business-level rate limiting. Monitor for unusual transaction patterns.",
            },
            {
                "id": "10.4.1",
                "title": "Audit logs are reviewed to identify anomalies",
                "description": "Business logic abuse patterns are detectable through log analysis and anomaly detection.",
                "status_if_found": "WARN",
                "remediation": "Log all sensitive business operations. Implement real-time anomaly detection. Alert on suspicious transaction velocity.",
            },
        ],
        "gdpr_articles": [
            "Article 5(1)(b) — Purpose Limitation",
            "Article 32 — Security of Processing",
        ],
    },
    # ── API7:2023 — Server Side Request Forgery (SSRF) ────────────────────
    "API7:2023": {
        "owasp_name": "Server Side Request Forgery",
        "description": "The API fetches a remote resource without validating the user-supplied URI, enabling attackers to access internal resources or services.",
        "pci_requirements": [
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of security vulnerabilities",
                "description": "SSRF allows attackers to pivot to internal systems, potentially accessing cardholder data environments (CDE).",
                "status_if_found": "FAIL",
                "remediation": "Validate and sanitize all user-supplied URLs. Use allowlists for permitted domains. Block requests to internal IP ranges (10.x, 172.16-31.x, 192.168.x).",
            },
            {
                "id": "1.3.1",
                "title": "Inbound traffic to the CDE is restricted",
                "description": "SSRF can bypass network segmentation by making the server initiate connections to internal resources.",
                "status_if_found": "FAIL",
                "remediation": "Implement network-level controls preventing servers from reaching internal resources. Use egress filtering. Isolate the CDE from application servers.",
            },
            {
                "id": "1.4.1",
                "title": "Outbound traffic from the CDE is restricted",
                "description": "SSRF in the CDE could exfiltrate cardholder data to attacker-controlled servers.",
                "status_if_found": "FAIL",
                "remediation": "Restrict outbound connections from CDE components. Monitor for unusual outbound traffic. Use DNS filtering.",
            },
        ],
        "gdpr_articles": [
            "Article 32(1)(a) — Encryption and pseudonymisation",
            "Article 32(1)(b) — Ongoing confidentiality, integrity, availability",
            "Article 33 — Notification of breach to supervisory authority",
        ],
    },
    # ── API8:2023 — Security Misconfiguration ─────────────────────────────
    "API8:2023": {
        "owasp_name": "Security Misconfiguration",
        "description": "Missing security headers, improper CORS configuration, verbose error messages, default credentials, or unnecessary features enabled.",
        "pci_requirements": [
            {
                "id": "2.2.1",
                "title": "Configuration standards are developed and implemented",
                "description": "Missing security headers (HSTS, CSP, X-Frame-Options) indicate non-compliance with configuration standards.",
                "status_if_found": "FAIL",
                "remediation": "Implement security header standards: HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. Remove debug endpoints.",
            },
            {
                "id": "2.2.4",
                "title": "Only necessary services are enabled",
                "description": "Unnecessary services and features increase the attack surface.",
                "status_if_found": "FAIL",
                "remediation": "Disable debug mode, unused HTTP methods, and directory listings. Remove default pages and documentation from production.",
            },
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of security vulnerabilities",
                "description": "Security misconfigurations must be caught during development through automated configuration validation.",
                "status_if_found": "FAIL",
                "remediation": "Add security header validation to CI/CD pipeline. Use infrastructure-as-code with security baselines. Automate configuration scanning.",
            },
            {
                "id": "2.2.7",
                "title": "All non-console administrative access is encrypted",
                "description": "API administrative interfaces must be encrypted and properly configured.",
                "status_if_found": "FAIL",
                "remediation": "Enforce TLS for all admin APIs. Disable plaintext HTTP administrative access. Implement certificate pinning where appropriate.",
            },
        ],
        "gdpr_articles": [
            "Article 25 — Data Protection by Design and by Default",
            "Article 32(1)(a) — Encryption of personal data",
            "Article 32(1)(b) — Ongoing confidentiality, integrity, availability",
        ],
    },
    # ── API9:2023 — Improper Inventory Management ─────────────────────────
    "API9:2023": {
        "owasp_name": "Improper Inventory Management",
        "description": "Lack of proper API inventory management leads to shadow APIs, deprecated endpoints, and exposed documentation.",
        "pci_requirements": [
            {
                "id": "6.3.2",
                "title": "An inventory of bespoke and custom software is maintained",
                "description": "Server and technology disclosure headers reveal software inventory to attackers. Shadow APIs bypass security controls.",
                "status_if_found": "WARN",
                "remediation": "Remove Server and X-Powered-By headers. Maintain a comprehensive API inventory. Decommission deprecated endpoints. Implement API versioning.",
            },
            {
                "id": "12.3.1",
                "title": "Each PCI DSS requirement is managed according to a targeted risk analysis",
                "description": "Technology disclosure and shadow APIs must be assessed as part of risk management.",
                "status_if_found": "WARN",
                "remediation": "Document all API endpoints. Conduct regular API discovery scans. Implement API lifecycle management.",
            },
            {
                "id": "11.3.1",
                "title": "Vulnerabilities are managed by risk ranking",
                "description": "Undocumented APIs are not included in vulnerability management, creating blind spots.",
                "status_if_found": "WARN",
                "remediation": "Include all discovered APIs in vulnerability scanning. Prioritize shadow API discovery. Use DevPulse Shadow API Discovery for continuous monitoring.",
            },
            {
                "id": "2.4.1",
                "title": "System configuration standards are updated",
                "description": "API inventory must be kept current with configuration standards.",
                "status_if_found": "WARN",
                "remediation": "Automate API inventory updates. Track API changes through version control. Maintain living API documentation.",
            },
        ],
        "gdpr_articles": [
            "Article 30 — Records of Processing Activities",
            "Article 32 — Security of Processing",
        ],
    },
    # ── API10:2023 — Unsafe Consumption of APIs ───────────────────────────
    "API10:2023": {
        "owasp_name": "Unsafe Consumption of APIs",
        "description": "Developers trust data from third-party APIs more than user input, leading to injection, SSRF, or data integrity issues.",
        "pci_requirements": [
            {
                "id": "6.2.4",
                "title": "Software development practices prevent introduction of security vulnerabilities",
                "description": "Trusting third-party API responses without validation introduces injection vulnerabilities and data integrity issues.",
                "status_if_found": "FAIL",
                "remediation": "Validate and sanitize all third-party API responses. Implement schema validation. Use prepared statements for data persistence. Treat external API data as untrusted input.",
            },
            {
                "id": "6.3.1",
                "title": "Security vulnerabilities are identified and addressed",
                "description": "Third-party API integrations must be included in security testing scope.",
                "status_if_found": "FAIL",
                "remediation": "Include third-party API integrations in SAST/DAST testing. Monitor for changes in third-party API schemas. Implement contract testing.",
            },
            {
                "id": "12.3.1",
                "title": "Each PCI DSS requirement is managed according to a targeted risk analysis",
                "description": "Third-party API dependencies must be assessed for security risk.",
                "status_if_found": "WARN",
                "remediation": "Conduct security assessments of all third-party API integrations. Implement API dependency risk scoring. Monitor for third-party API security advisories.",
            },
        ],
        "gdpr_articles": [
            "Article 28 — Processor",
            "Article 32(1)(b) — Ongoing confidentiality, integrity, availability",
            "Article 44 — General principle for transfers",
        ],
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# OWASP → GDPR Comprehensive Mapping
# ──────────────────────────────────────────────────────────────────────────────

OWASP_GDPR_MAPPING: dict[str, dict[str, Any]] = {
    "API1:2023": {
        "owasp_name": "Broken Object Level Authorization",
        "gdpr_articles": [
            {
                "article": "Article 5(1)(f)",
                "title": "Integrity and Confidentiality",
                "requirement": "Personal data must be processed in a manner that ensures appropriate security, including protection against unauthorized processing and accidental loss.",
                "recommendation": "Implement object-level access controls. Validate user ownership before returning personal data resources.",
            },
            {
                "article": "Article 25",
                "title": "Data Protection by Design and by Default",
                "requirement": "Controllers shall implement appropriate technical measures designed to implement data-protection principles effectively.",
                "recommendation": "Design authorization checks into every API endpoint from the start. Default to deny access.",
            },
            {
                "article": "Article 32",
                "title": "Security of Processing",
                "requirement": "Implement measures to ensure the ongoing confidentiality of processing systems and services.",
                "recommendation": "Monitor for authorization bypass attempts. Log all access to personal data resources.",
            },
        ],
    },
    "API2:2023": {
        "owasp_name": "Broken Authentication",
        "gdpr_articles": [
            {
                "article": "Article 32(1)(b)",
                "title": "Ongoing Confidentiality, Integrity, Availability",
                "requirement": "Ensure the ability to ensure ongoing confidentiality, integrity, availability, and resilience of processing systems.",
                "recommendation": "Implement strong authentication mechanisms. Use MFA for accessing personal data.",
            },
            {
                "article": "Article 32(1)(d)",
                "title": "Regular Testing of Security",
                "requirement": "A process for regularly testing, assessing, and evaluating the effectiveness of technical and organisational measures.",
                "recommendation": "Conduct regular penetration testing of authentication endpoints. Test for credential stuffing resistance.",
            },
        ],
    },
    "API3:2023": {
        "owasp_name": "Broken Object Property Level Authorization",
        "gdpr_articles": [
            {
                "article": "Article 5(1)(c)",
                "title": "Data Minimisation",
                "requirement": "Personal data shall be adequate, relevant, and limited to what is necessary in relation to the purposes for which they are processed.",
                "recommendation": "Return only required fields in API responses. Implement field-level access control. Strip unnecessary personal data from responses.",
            },
            {
                "article": "Article 5(1)(f)",
                "title": "Integrity and Confidentiality",
                "requirement": "Personal data must be processed with appropriate security including protection against unauthorized access.",
                "recommendation": "Validate that the requesting user has access to each data field. Implement data masking for sensitive attributes.",
            },
            {
                "article": "Article 25",
                "title": "Data Protection by Design and by Default",
                "requirement": "Implement data-protection principles such as data minimisation at the design stage.",
                "recommendation": "Use allowlists for API response fields. Default to minimum data exposure.",
            },
        ],
    },
    "API4:2023": {
        "owasp_name": "Unrestricted Resource Consumption",
        "gdpr_articles": [
            {
                "article": "Article 32(1)(b)",
                "title": "Ongoing Availability",
                "requirement": "Ensure ongoing availability and resilience of processing systems and services.",
                "recommendation": "Implement rate limiting to prevent denial of service. Ensure personal data remains accessible to authorized users.",
            },
            {
                "article": "Article 32(1)(c)",
                "title": "Restore Availability",
                "requirement": "The ability to restore the availability and access to personal data in a timely manner in the event of an incident.",
                "recommendation": "Implement backup and recovery procedures. Test restoration of API services handling personal data.",
            },
        ],
    },
    "API5:2023": {
        "owasp_name": "Broken Function Level Authorization",
        "gdpr_articles": [
            {
                "article": "Article 5(1)(f)",
                "title": "Integrity and Confidentiality",
                "requirement": "Personal data shall be processed with appropriate security against unauthorized or unlawful processing.",
                "recommendation": "Implement function-level RBAC. Prevent users from invoking administrative operations on personal data.",
            },
            {
                "article": "Article 25",
                "title": "Data Protection by Design",
                "requirement": "Implement data-protection principles at the design stage of processing operations.",
                "recommendation": "Design access control into the API architecture. Implement deny-by-default for all functions.",
            },
        ],
    },
    "API6:2023": {
        "owasp_name": "Unrestricted Access to Sensitive Business Flows",
        "gdpr_articles": [
            {
                "article": "Article 5(1)(b)",
                "title": "Purpose Limitation",
                "requirement": "Personal data shall be collected for specified, explicit, and legitimate purposes and not further processed in a manner incompatible with those purposes.",
                "recommendation": "Implement business logic validation. Ensure API consumers can only use personal data for stated purposes.",
            },
            {
                "article": "Article 32",
                "title": "Security of Processing",
                "requirement": "Implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk.",
                "recommendation": "Monitor for automated abuse of personal data processing flows. Implement transaction velocity limits.",
            },
        ],
    },
    "API7:2023": {
        "owasp_name": "Server Side Request Forgery",
        "gdpr_articles": [
            {
                "article": "Article 32(1)(a)",
                "title": "Encryption and Pseudonymisation",
                "requirement": "Implement pseudonymisation and encryption of personal data.",
                "recommendation": "Validate all user-supplied URLs. Block requests to internal data stores containing personal data.",
            },
            {
                "article": "Article 32(1)(b)",
                "title": "Ongoing Confidentiality",
                "requirement": "Ensure ongoing confidentiality of processing systems and services.",
                "recommendation": "Implement egress filtering. Prevent SSRF from accessing personal data repositories.",
            },
            {
                "article": "Article 33",
                "title": "Breach Notification",
                "requirement": "Notify supervisory authority within 72 hours of becoming aware of a personal data breach.",
                "recommendation": "Monitor for SSRF indicators. Include SSRF in incident response procedures for breach notification.",
            },
        ],
    },
    "API8:2023": {
        "owasp_name": "Security Misconfiguration",
        "gdpr_articles": [
            {
                "article": "Article 25",
                "title": "Data Protection by Design and by Default",
                "requirement": "Implement appropriate technical and organisational measures designed to implement data-protection principles.",
                "recommendation": "Implement security headers by default. Remove debug endpoints from production. Use secure default configurations.",
            },
            {
                "article": "Article 32(1)(a)",
                "title": "Encryption of Personal Data",
                "requirement": "Implement encryption of personal data in transit and at rest.",
                "recommendation": "Enforce HTTPS with HSTS. Remove server version headers that reveal encryption weaknesses.",
            },
            {
                "article": "Article 32(1)(b)",
                "title": "Ongoing Confidentiality",
                "requirement": "Ensure ongoing confidentiality, integrity, availability, and resilience of processing systems.",
                "recommendation": "Implement configuration baselines. Automate security configuration validation. Remove unnecessary services.",
            },
        ],
    },
    "API9:2023": {
        "owasp_name": "Improper Inventory Management",
        "gdpr_articles": [
            {
                "article": "Article 30",
                "title": "Records of Processing Activities",
                "requirement": "Maintain records of processing activities including purposes, categories of data, recipients, transfers, and time limits.",
                "recommendation": "Maintain a comprehensive API inventory mapping each endpoint to the personal data it processes. Document data flows for GDPR compliance.",
            },
            {
                "article": "Article 32",
                "title": "Security of Processing",
                "requirement": "Implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk.",
                "recommendation": "Shadow APIs bypass security controls and process personal data without oversight. Implement continuous API discovery.",
            },
            {
                "article": "Article 17",
                "title": "Right to Erasure",
                "requirement": "Data subjects have the right to obtain erasure of personal data without undue delay.",
                "recommendation": "Undocumented APIs may retain personal data even after erasure requests. Maintain complete API inventory for GDPR compliance.",
            },
        ],
    },
    "API10:2023": {
        "owasp_name": "Unsafe Consumption of APIs",
        "gdpr_articles": [
            {
                "article": "Article 28",
                "title": "Processor",
                "requirement": "Processing by a processor shall be governed by a contract that sets out the subject matter, duration, nature, and purpose of processing.",
                "recommendation": "Establish data processing agreements with third-party API providers. Validate their security practices.",
            },
            {
                "article": "Article 32(1)(b)",
                "title": "Ongoing Confidentiality",
                "requirement": "Ensure ongoing confidentiality, integrity, availability, and resilience of processing systems.",
                "recommendation": "Validate and sanitize all data received from third-party APIs. Monitor for changes in third-party API behavior.",
            },
            {
                "article": "Article 44",
                "title": "General Principle for Transfers",
                "requirement": "Transfer of personal data to a third country may only take place if the conditions laid down in Chapter V are met.",
                "recommendation": "Audit third-party APIs for data residency. Ensure cross-border data transfers comply with GDPR Chapter V.",
            },
        ],
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# GDPR Standalone Assessment Criteria
# ──────────────────────────────────────────────────────────────────────────────

GDPR_ASSESSMENT_CRITERIA: list[dict[str, Any]] = [
    {
        "article": "Article 5(1)(b)",
        "title": "Purpose Limitation",
        "description": "Personal data shall be collected for specified, explicit and legitimate purposes and not further processed in a manner incompatible with those purposes.",
        "check_keywords": ["data leak", "excessive data", "overfetching"],
        "remediation": "Audit all API endpoints to ensure personal data is only used for its stated purpose. Implement data usage logging.",
    },
    {
        "article": "Article 5(1)(c)",
        "title": "Data Minimisation",
        "description": "Personal data shall be adequate, relevant and limited to what is necessary.",
        "check_keywords": ["excessive data", "data exposure", "verbose response"],
        "remediation": "Implement response filtering. Return only required fields. Audit API response schemas.",
    },
    {
        "article": "Article 5(1)(f)",
        "title": "Integrity and Confidentiality",
        "description": "Personal data shall be processed in a manner that ensures appropriate security.",
        "check_keywords": ["authorization", "authentication", "access control"],
        "remediation": "Implement encryption, access controls, and integrity checks on all personal data processing endpoints.",
    },
    {
        "article": "Article 17",
        "title": "Right to Erasure",
        "description": "Data subjects have the right to obtain erasure of personal data.",
        "check_keywords": ["data retention", "deletion", "erasure"],
        "remediation": "Implement API endpoints for data deletion. Ensure all downstream systems honor erasure requests within 30 days.",
    },
    {
        "article": "Article 25",
        "title": "Data Protection by Design",
        "description": "Implement appropriate technical measures designed to implement data-protection principles.",
        "check_keywords": ["default", "configuration", "design"],
        "remediation": "Design privacy into API architecture. Default to data protection. Implement privacy-enhancing technologies.",
    },
    {
        "article": "Article 30",
        "title": "Records of Processing Activities",
        "description": "Maintain records of all processing activities involving personal data.",
        "check_keywords": ["inventory", "documentation", "catalog"],
        "remediation": "Maintain an API inventory documenting each endpoint's data processing activities for GDPR Article 30 compliance.",
    },
    {
        "article": "Article 32(1)(a)",
        "title": "Encryption and Pseudonymisation",
        "description": "Implement pseudonymisation and encryption of personal data.",
        "check_keywords": ["http instead of https", "hsts", "tls", "ssl"],
        "remediation": "Enforce TLS 1.2+ on all API endpoints. Implement HSTS. Use pseudonymisation for personal data in non-production environments.",
    },
    {
        "article": "Article 32(1)(b)",
        "title": "Ongoing Confidentiality, Integrity, Availability",
        "description": "Ensure ongoing confidentiality, integrity, availability, and resilience of processing systems.",
        "check_keywords": ["availability", "resilience", "backup", "dos"],
        "remediation": "Implement high availability for APIs processing personal data. Test disaster recovery. Implement rate limiting.",
    },
    {
        "article": "Article 32(1)(c)",
        "title": "Restore Availability",
        "description": "Ability to restore availability and access to personal data in a timely manner.",
        "check_keywords": ["backup", "recovery", "restore"],
        "remediation": "Implement automated backup of personal data. Test restoration procedures quarterly. Document recovery time objectives.",
    },
    {
        "article": "Article 33",
        "title": "Breach Notification",
        "description": "Notify supervisory authority within 72 hours of becoming aware of a personal data breach.",
        "check_keywords": ["breach", "incident", "notification"],
        "remediation": "Implement breach detection for APIs. Establish 72-hour notification workflow. Include API security events in incident response.",
    },
    {
        "article": "Article 35",
        "title": "Data Protection Impact Assessment",
        "description": "Carry out a DPIA for processing likely to result in high risk to data subjects.",
        "check_keywords": ["high risk", "assessment", "impact"],
        "remediation": "Conduct DPIA for APIs processing special categories of personal data. Document risk assessment for new API endpoints.",
    },
]


def get_owasp_categories() -> list[str]:
    """Return all OWASP API Security Top 10 (2023) category IDs."""
    return list(OWASP_PCI_DSS_MAPPING.keys())


def get_owasp_to_pci_mapping(owasp_id: str) -> dict[str, Any] | None:
    """Get PCI DSS requirements mapped to a specific OWASP category."""
    return OWASP_PCI_DSS_MAPPING.get(owasp_id)


def get_owasp_to_gdpr_mapping(owasp_id: str) -> dict[str, Any] | None:
    """Get GDPR articles mapped to a specific OWASP category."""
    return OWASP_GDPR_MAPPING.get(owasp_id)


def get_all_pci_requirements() -> list[dict[str, Any]]:
    """Get all unique PCI DSS requirements across all OWASP categories."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for owasp_id, mapping in OWASP_PCI_DSS_MAPPING.items():
        for req in mapping["pci_requirements"]:
            if req["id"] not in seen:
                seen.add(req["id"])
                result.append({**req, "owasp_source": owasp_id})
    return result


def get_all_gdpr_articles() -> list[dict[str, Any]]:
    """Get all unique GDPR articles across all OWASP categories."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for owasp_id, mapping in OWASP_GDPR_MAPPING.items():
        for article in mapping["gdpr_articles"]:
            if article["article"] not in seen:
                seen.add(article["article"])
                result.append({**article, "owasp_source": owasp_id})
    return result
