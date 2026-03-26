#!/usr/bin/env python3
"""
OWASP API Security Scanner CLI
===============================
Standalone command-line scanner for OWASP API Top 10 vulnerabilities.

Usage:
    python scanner_cli.py <target_url> [--auth-token TOKEN] [--output json] [--verbose]

Examples:
    python scanner_cli.py https://api.example.com/users/123
    python scanner_cli.py https://api.example.com --auth-token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    python scanner_cli.py https://api.example.com --output json --verbose
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from services.owasp_engine import OwaspScanner, Severity, ScanResult


# ── Output formatters ──────────────────────────────────────────────────────

SEVERITY_COLORS = {
    "CRITICAL": "\033[91m",  # Red
    "HIGH": "\033[93m",      # Yellow
    "MEDIUM": "\033[94m",    # Blue
    "LOW": "\033[92m",       # Green
    "RESET": "\033[0m",
}


def format_severity(severity: str) -> str:
    """Format severity with color for terminal output."""
    color = SEVERITY_COLORS.get(severity, "")
    reset = SEVERITY_COLORS["RESET"]
    return f"{color}{severity}{reset}"


def print_text_report(result: ScanResult, verbose: bool = False) -> None:
    """Print human-readable scan report."""
    print("\n" + "=" * 80)
    print("OWASP API SECURITY SCAN REPORT")
    print("=" * 80)

    print(f"\n🎯 Target URL: {result.target_url}")
    print(f"📋 Scan ID: {result.scan_id}")
    print(f"⏱️  Duration: {result.scan_duration_ms:.2f}ms")
    print(f"📊 Total Findings: {len(result.findings)}")

    # Summary
    summary = result.summary
    severity_counts = summary.get("severity_counts", {})
    risk_score = summary.get("risk_score", 0)

    print(f"\n⚠️  Risk Score: {risk_score}/100")
    print("\n📈 Severity Breakdown:")
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        count = severity_counts.get(sev, 0)
        if count > 0:
            print(f"   {format_severity(sev)}: {count}")

    # Categories
    categories = summary.get("owasp_categories_detected", [])
    if categories:
        print(f"\n📚 OWASP Categories Detected:")
        for cat in categories:
            print(f"   • {cat}")

    # Findings
    if result.findings:
        print("\n" + "=" * 80)
        print("VULNERABILITY DETAILS")
        print("=" * 80)

        # Sort by severity
        sorted_findings = sorted(
            result.findings,
            key=lambda f: Severity[f["severity"]].weight if isinstance(f["severity"], str) else Severity(f["severity"]).weight,
            reverse=True,
        )

        for i, finding in enumerate(sorted_findings, 1):
            print(f"\n[{i}] {format_severity(finding.severity)} - {finding.title}")
            print(f"    OWASP ID: {finding.owasp_id}")
            print(f"    Category: {finding.owasp_category}")
            print(f"    CWE: {finding.cwe}")
            print(f"    CVSS: {finding.cvss:.1f}")
            print(f"\n    📝 Description:")
            print(f"       {finding.description}")
            print(f"\n    🔍 Evidence:")
            print(f"       {finding.evidence}")
            print(f"\n    ✅ Recommendation:")
            print(f"       {finding.recommendation}")

            if verbose and hasattr(finding, "to_dict"):
                finding_dict = finding.to_dict() if callable(finding.to_dict) else finding.to_dict()
                print(f"\n    📄 Full Details:")
                for key, value in finding_dict.items():
                    if key not in ("title", "description", "evidence", "recommendation"):
                        print(f"       {key}: {value}")
    else:
        print("\n✅ No vulnerabilities detected!")

    print("\n" + "=" * 80)
    print("END OF REPORT")
    print("=" * 80 + "\n")


def print_json_report(result: ScanResult, pretty: bool = True) -> None:
    """Print JSON-formatted scan report."""
    output = result.to_dict()
    if pretty:
        print(json.dumps(output, indent=2, default=str))
    else:
        print(json.dumps(output, default=str))


# ── Main scanner ────────────────────────────────────────────────────────────

async def run_scan(
    target_url: str,
    auth_token: str = "",
    extra_headers: dict[str, str] | None = None,
    timeout: float = 30.0,
) -> ScanResult:
    """Run OWASP API security scan."""
    scanner = OwaspScanner(
        auth_token=auth_token,
        extra_headers=extra_headers,
        timeout=timeout,
    )
    return await scanner.scan(target_url)


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="OWASP API Security Scanner - Detect OWASP API Top 10 vulnerabilities",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s https://api.example.com/users/123
  %(prog)s https://api.example.com --auth-token YOUR_JWT_TOKEN
  %(prog)s https://api.example.com --output json --verbose
  %(prog)s https://api.example.com --timeout 60 --output report.json

OWASP API Top 10 Categories:
  API1:2023  - Broken Object Level Authorization (BOLA/IDOR)
  API2:2023  - Broken Authentication
  API3:2023  - Broken Object Property Authorization
  API4:2023  - Unrestricted Resource Consumption
  API5:2023  - Broken Function Level Authorization
  API6:2023  - Unrestricted Access to Sensitive Business Flows
  API7:2023  - Server Side Request Forgery (SSRF)
  API8:2023  - Security Misconfiguration
  API9:2023  - Improper Inventory Management
  API10:2023 - Unsafe Consumption of APIs
        """,
    )

    parser.add_argument(
        "target_url",
        help="Target API URL to scan (e.g., https://api.example.com/users/123)",
    )
    parser.add_argument(
        "--auth-token", "-t",
        default="",
        help="Authentication token (JWT Bearer token) for authenticated scans",
    )
    parser.add_argument(
        "--header", "-H",
        action="append",
        dest="headers",
        metavar="HEADER:VALUE",
        help="Additional HTTP header (can be specified multiple times)",
    )
    parser.add_argument(
        "--output", "-o",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--output-file", "-f",
        help="Write output to file instead of stdout",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output with additional details",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Request timeout in seconds (default: 30)",
    )
    parser.add_argument(
        "--severity-filter",
        choices=["all", "high", "critical"],
        default="all",
        help="Filter findings by minimum severity (default: all)",
    )

    args = parser.parse_args()

    # Parse headers
    extra_headers: dict[str, str] = {}
    if args.headers:
        for header in args.headers:
            if ":" in header:
                key, value = header.split(":", 1)
                extra_headers[key.strip()] = value.strip()

    # Run scan
    print(f"🔍 Starting OWASP API Security Scan...", file=sys.stderr)
    print(f"   Target: {args.target_url}", file=sys.stderr)
    if args.auth_token:
        print(f"   Auth: Bearer token provided", file=sys.stderr)
    if extra_headers:
        print(f"   Headers: {len(extra_headers)} custom headers", file=sys.stderr)
    print(file=sys.stderr)

    try:
        result = asyncio.run(
            run_scan(
                target_url=args.target_url,
                auth_token=args.auth_token,
                extra_headers=extra_headers,
                timeout=args.timeout,
            )
        )

        # Filter by severity if requested
        if args.severity_filter != "all":
            min_severity = Severity[args.severity_filter.upper()].weight
            filtered_findings = [
                f for f in result.findings
                if Severity[f.severity].weight >= min_severity
            ]
            result.findings = filtered_findings

        # Format output
        if args.output == "json":
            output = json.dumps(result.to_dict(), indent=2, default=str)
        else:
            # Capture text output
            import io
            from contextlib import redirect_stdout

            f = io.StringIO()
            with redirect_stdout(f):
                print_text_report(result, verbose=args.verbose)
            output = f.getvalue()

        # Write output
        if args.output_file:
            with open(args.output_file, "w", encoding="utf-8") as file:
                file.write(output)
            print(f"✅ Report written to: {args.output_file}", file=sys.stderr)
        else:
            print(output)

        # Return exit code based on findings
        critical_count = sum(1 for f in result.findings if f.severity == "CRITICAL")
        high_count = sum(1 for f in result.findings if f.severity == "HIGH")

        if critical_count > 0:
            return 2  # Critical findings
        elif high_count > 0:
            return 1  # High findings
        return 0  # No high/critical findings

    except KeyboardInterrupt:
        print("\n⚠️  Scan interrupted by user", file=sys.stderr)
        return 130
    except Exception as e:
        print(f"❌ Scan failed: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
