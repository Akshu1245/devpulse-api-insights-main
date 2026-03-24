import * as vscode from "vscode";
import { DevPulseClient } from "../services/devPulseClient";

/**
 * HoverProvider
 * Shows API details and risk information on hover
 */
export class HoverProvider implements vscode.HoverProvider {
  private readonly apiPatterns = [
    /(?:fetch|axios|http\.(?:get|post|put|delete|patch))\s*\(\s*['"](.*?)['"]/,
    /endpoint\s*[:=]\s*['"](.*?)['"]/,
    /url\s*[:=]\s*['"](.*?)['"]/,
    /path\s*[:=]\s*['"](\/api\/[^'"]*)/
  ];

  constructor(private devPulseClient: DevPulseClient) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const line = document.lineAt(position.line).text;

    for (const pattern of this.apiPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const endpoint = match[1];

        try {
          const details = await this.devPulseClient.getEndpointDetails(endpoint);
          if (details) {
            return this.createHoverContent(endpoint, details);
          }
        } catch (error) {
          console.error("Error getting endpoint details:", error);
        }
      }
    }

    return null;
  }

  private createHoverContent(endpoint: string, details: any): vscode.Hover {
    const markdown = new vscode.MarkdownString();

    markdown.appendMarkdown(`### 🔒 API Risk Analysis\n\n`);
    markdown.appendMarkdown(`**Endpoint:** \`${endpoint}\`\n\n`);

    // Risk level
    const riskLevel = details.risk_level || "unknown";
    const riskEmoji = {
      critical: "🔴",
      high: "🟠",
      medium: "🟡",
      low: "🟢"
    }[riskLevel] || "⚪";

    markdown.appendMarkdown(`**Risk Level:** ${riskEmoji} ${riskLevel.toUpperCase()}\n\n`);

    if (details.risk_score) {
      markdown.appendMarkdown(`**Risk Score:** ${details.risk_score}/100\n\n`);
    }

    // Compliance requirements
    if (details.compliance && details.compliance.length > 0) {
      markdown.appendMarkdown(`**Compliance Requirements:**\n`);
      for (const req of details.compliance) {
        markdown.appendMarkdown(`- ${req}\n`);
      }
      markdown.appendMarkdown(`\n`);
    }

    // Anomalies
    if (details.anomalies && details.anomalies.length > 0) {
      markdown.appendMarkdown(`**Detected Anomalies:**\n`);
      for (const anomaly of details.anomalies) {
        markdown.appendMarkdown(`- ${anomaly}\n`);
      }
      markdown.appendMarkdown(`\n`);
    }

    // Security recommendations
    if (details.recommendations && details.recommendations.length > 0) {
      markdown.appendMarkdown(`**Recommendations:**\n`);
      for (const rec of details.recommendations) {
        markdown.appendMarkdown(`- ${rec}\n`);
      }
    }

    // Cost information
    if (details.cost_impact) {
      markdown.appendMarkdown(`\n**Cost Impact:** $${details.cost_impact}\n`);
    }

    // Last analyzed
    if (details.last_analyzed) {
      markdown.appendMarkdown(`\n*Last analyzed: ${details.last_analyzed}*\n`);
    }

    markdown.isTrusted = true;

    return new vscode.Hover(markdown);
  }
}
