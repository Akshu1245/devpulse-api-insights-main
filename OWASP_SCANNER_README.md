# OWASP API Security Scanning Engine

## Overview

A comprehensive **OWASP API Top 10 scanning engine** that performs real vulnerability detection through:

- ✅ **Request simulation** - Actively probes APIs with malicious payloads
- ✅ **Response analysis** - Analyzes responses for vulnerability indicators
- ✅ **Pattern detection** - Identifies security anti-patterns in headers, bodies, and behavior
- ✅ **Rule-based architecture** - Each vulnerability category is a dedicated, extendable function

## Features

### Vulnerability Detection

| Category | OWASP ID | Severity | Detection Method |
|----------|----------|----------|------------------|
| **Broken Object Level Authorization** | API1:2023 | HIGH/CRITICAL | ID manipulation, auth bypass, sequential ID enumeration |
| **Broken Authentication** | API2:2023 | HIGH/CRITICAL | JWT analysis, brute-force testing, cookie security |
| **Excessive Data Exposure** | API3:2023 | MEDIUM/HIGH | PII detection, sensitive field scanning, debug endpoint discovery |
| **Mass Assignment** | API3:2023 | CRITICAL | Privilege escalation, price manipulation, read-only field modification |
| **Security Misconfiguration** | API8:2023 | LOW-HIGH | Header analysis, CORS testing, TLS checks, rate limiting |
| **Injection** | API8:2023 | CRITICAL | SQLi, XSS, Command Injection, NoSQL injection, SSTI |
| **Rate Limiting** | API8:2023 | MEDIUM/HIGH | Rapid-fire testing, concurrent connection analysis |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OWASP Scanner Engine                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   BOLA       │  │   Auth       │  │   Data       │      │
│  │   Checker    │  │   Checker    │  │   Exposure   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Mass       │  │   Security   │  │   Injection  │      │
│  │   Assignment │  │   Config     │  │   Checker    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│              Response Analysis Engine                        │
│  • Sensitive Field Detection    • PII Pattern Matching      │
│  • Error Pattern Analysis       • JWT Decoding              │
├─────────────────────────────────────────────────────────────┤
│              HTTP Client (async httpx)                       │
│  • Request Simulation           • Concurrent Probing         │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Python 3.10+
- `httpx` for async HTTP requests

```bash
pip install httpx python-dotenv
```

## Usage

### CLI Scanner

```bash
# Basic scan
python backend/scanner_cli.py https://api.example.com/users/123

# With authentication
python backend/scanner_cli.py https://api.example.com/users/123 \
  --auth-token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JSON output
python backend/scanner_cli.py https://api.example.com \
  --output json --output-file scan_report.json

# Verbose mode
python backend/scanner_cli.py https://api.example.com --verbose

# Filter by severity
python backend/scanner_cli.py https://api.example.com \
  --severity-filter high
```

### Programmatic Usage

```python
import asyncio
from services.owasp_engine import OwaspScanner

async def scan_api():
    scanner = OwaspScanner(
        auth_token="your-jwt-token",
        extra_headers={"X-Custom-Header": "value"},
        timeout=30.0,
    )
    
    result = await scanner.scan("https://api.example.com/users/123")
    
    print(f"Risk Score: {result.summary['risk_score']}/100")
    print(f"Findings: {len(result.findings)}")
    
    for finding in result.findings:
        print(f"  [{finding.severity}] {finding.title}")

asyncio.run(scan_api())
```

### Generate Sample Reports

```bash
python backend/sample_scan_results.py
```

This generates sample scan results in `sample_scan_results/`:
- `vulnerable_api_scan.json` - API with multiple critical vulnerabilities
- `secure_api_scan.json` - Well-configured API with minimal findings
- `ecommerce_api_scan.json` - E-commerce API with business logic vulns

## Rule System

### Creating Custom Rules

Each vulnerability category is a function decorated with `@register_rule`:

```python
from services.owasp_engine import (
    register_rule,
    Finding,
    ScanContext,
    safe_request,
)

@register_rule
async def check_custom_vulnerability(ctx: ScanContext) -> None:
    """Detect custom vulnerability."""
    
    # Access baseline response
    baseline_status = ctx.metadata.get("baseline_status", 0)
    baseline_json = ctx.metadata.get("baseline_json")
    
    # Make test requests
    resp = await safe_request(ctx.client, "GET", ctx.target_url)
    
    if resp and resp.status_code == 200:
        # Analyze response
        if is_vulnerable(resp):
            ctx.add(
                Finding(
                    owasp_category="Custom Category",
                    owasp_id="APIX:2023",
                    title="Vulnerability Title",
                    severity="HIGH",
                    description="Detailed description...",
                    evidence="Evidence from scan...",
                    recommendation="How to fix...",
                    cwe="CWE-XXX",
                    cvss=7.5,
                )
            )
```

### Rule Registration

Rules are auto-loaded from `backend/services/owasp_rules/`. Add new rules to `__init__.py`:

```python
from services.owasp_rules import your_new_rule  # noqa: F401
```

## Detection Methods

### 1. Broken Object Level Authorization (BOLA)

**Tests:**
- ID manipulation in path segments (`/users/123` → `/users/124`)
- Sequential ID enumeration
- Authentication bypass (request without token)
- Cross-tenant access attempts

**Example Detection:**
```
GET /api/users/123 → 200 OK (baseline)
GET /api/users/124 → 200 OK (different user data!)
GET /api/users/123 (no auth) → 200 OK (CRITICAL!)
```

### 2. Broken Authentication

**Tests:**
- JWT analysis (algorithm, expiration, sensitive claims)
- Brute-force protection (rapid failed logins)
- Token in URL parameters
- Cookie security flags (HttpOnly, Secure, SameSite)
- HTTP method bypass

**Example Detection:**
```
JWT payload: {"user_id": 123, "role": "admin"}  # No 'exp' claim!
POST /auth/login (10x rapid) → All 401, no 429
Set-Cookie: session=abc123  # Missing HttpOnly, Secure
```

### 3. Excessive Data Exposure

**Tests:**
- Sensitive field detection in JSON (password_hash, internal_id, etc.)
- PII pattern matching (email, SSN, credit card, phone)
- Stack trace / error message leakage
- Debug/admin endpoint discovery
- Response size analysis

**Example Detection:**
```json
{
  "user": {
    "id": 123,
    "email": "user@example.com",
    "password_hash": "$2b$10$...",  // ⚠️ Sensitive!
    "internal_id": "INT-789",       // ⚠️ Internal!
    "ssn": "123-45-6789"            // ⚠️ PII!
  }
}
```

### 4. Mass Assignment

**Tests:**
- Privilege escalation fields (`role`, `is_admin`, `permissions`)
- Price manipulation (`price`, `amount`, `discount`)
- Read-only field modification (`id`, `created_at`, `user_id`)
- Internal field injection (`password`, `debug_mode`)
- Nested object injection

**Example Detection:**
```
PUT /api/users/123
Body: {"name": "test", "role": "admin", "is_admin": true}
Response: {"id": 123, "role": "admin", "is_admin": true}  // ⚠️ Accepted!
```

### 5. Security Misconfiguration

**Tests:**
- Security headers (HSTS, CSP, X-Frame-Options, etc.)
- CORS misconfiguration (wildcard, origin reflection)
- Technology disclosure (Server, X-Powered-By headers)
- Dangerous HTTP methods (TRACE, CONNECT, DEBUG)
- Rate limiting enforcement
- Open redirects
- TLS configuration

**Example Detection:**
```
Response Headers:
  ❌ Missing: Strict-Transport-Security
  ❌ Missing: Content-Security-Policy
  Access-Control-Allow-Origin: *  // ⚠️ Open CORS
  Server: nginx/1.18.0  // ⚠️ Version disclosure
```

### 6. Injection

**Tests:**
- SQL Injection (classic, union, error-based, time-based)
- NoSQL Injection (MongoDB operators)
- XSS (reflected, event handlers, protocol-based)
- Command Injection (OS command execution)
- LDAP Injection
- SSTI (Server-Side Template Injection)

**Example Detection:**
```
GET /api/users?id=' OR '1'='1' --
Response: 500 Internal Server Error
Body: "SQL syntax error near '' OR' at line 1"  // ⚠️ SQLi!
```

## Output Format

### Scan Result Structure

```json
{
  "target_url": "https://api.example.com/users/123",
  "scan_id": "uuid-here",
  "timestamp": "2024-03-25T10:30:00Z",
  "scan_duration_ms": 4523.67,
  "total_findings": 5,
  "summary": {
    "severity_counts": {
      "CRITICAL": 2,
      "HIGH": 2,
      "MEDIUM": 1,
      "LOW": 0
    },
    "owasp_categories_detected": [
      "Broken Object Level Authorization",
      "Broken Authentication"
    ],
    "risk_score": 85
  },
  "findings": [
    {
      "owasp_category": "Broken Object Level Authorization",
      "owasp_id": "API1:2023",
      "title": "Resource Accessible Without Authentication",
      "severity": "CRITICAL",
      "description": "...",
      "evidence": "...",
      "recommendation": "...",
      "cwe": "CWE-306",
      "cvss": 9.1
    }
  ]
}
```

### Severity Levels

| Severity | Color | Risk Score Impact | Response |
|----------|-------|-------------------|----------|
| **CRITICAL** | 🔴 Red | +25 points | Immediate action required |
| **HIGH** | 🟠 Orange | +15 points | Fix within 24-48 hours |
| **MEDIUM** | 🟡 Yellow | +8 points | Fix within 1-2 weeks |
| **LOW** | 🟢 Green | +3 points | Fix in next release |

### Risk Score Calculation

```
Risk Score = (CRITICAL × 25) + (HIGH × 15) + (MEDIUM × 8) + (LOW × 3)
```

Capped at 100.

## Integration

### FastAPI Backend

```python
from backend.services.owasp_engine import OwaspScanner

@app.post("/scan")
async def scan_endpoint(request: ScanRequest):
    scanner = OwaspScanner(auth_token=request.auth_token)
    result = await scanner.scan(request.target_url)
    return result.to_dict()
```

### CI/CD Pipeline

```yaml
# .github/workflows/security-scan.yml
- name: OWASP API Scan
  run: |
    python backend/scanner_cli.py ${{ vars.API_URL }} \
      --auth-token ${{ secrets.API_TOKEN }} \
      --output json \
      --output-file scan-report.json
    
- name: Upload Report
  uses: actions/upload-artifact@v3
  with:
    name: security-scan-report
    path: scan-report.json
```

## Best Practices

### For Accurate Scans

1. **Use a staging environment** - Scanning can trigger destructive payloads
2. **Provide authentication** - Authenticated scans find more vulnerabilities
3. **Set appropriate timeouts** - Some tests involve multiple requests
4. **Review findings manually** - False positives can occur

### For Production

1. **Run scans regularly** - API security is continuous
2. **Integrate into CI/CD** - Catch vulnerabilities before deployment
3. **Monitor risk score trends** - Track security improvements
4. **Prioritize by severity** - Fix CRITICAL and HIGH first

## Limitations

- **Active scanning** - May trigger rate limits or WAFs
- **False positives** - Manual verification recommended
- **Authentication required** - Some endpoints need valid tokens
- **Network dependent** - Requires connectivity to target API

## Troubleshooting

### Scan Fails with Connection Error

```bash
# Check if API is reachable
curl https://api.example.com

# Increase timeout
python scanner_cli.py https://api.example.com --timeout 60
```

### Too Many False Positives

- Ensure you're scanning the production-like environment
- Provide valid authentication tokens
- Review response patterns in verbose mode

### Scan Takes Too Long

- Reduce timeout: `--timeout 15`
- Limit concurrent tests (modify scanner settings)
- Scan specific endpoints instead of full API

## References

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [CWE Dictionary](https://cwe.mitre.org/)
- [CVSS Calculator](https://www.first.org/cvss/calculator/3.1)

## License

MIT License - See LICENSE file for details.
