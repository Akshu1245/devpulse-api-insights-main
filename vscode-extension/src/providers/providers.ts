import * as vscode from "vscode";
import { DevPulseClient } from "../services/devPulseClient";

/**
 * CodeLensProvider
 * Shows actionable code lens above API endpoint definitions
 */
export class CodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private readonly apiPatterns = [
    /const\s+(\w+)\s*=\s*['"](\/api\/[^'"]*)/,
    /endpoint\s*[:=]\s*['"](.*?)['"]/,
    /url\s*[:=]\s*['"](.*?)['"]/
  ];

  onDidChangeCodeLenses?: vscode.Event<void> | undefined;

  constructor(private devPulseClient: DevPulseClient) {}

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    this.codeLenses = [];
    const text = document.getText();
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of this.apiPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const endpoint = match[1];
          const range = new vscode.Range(
            new vscode.Position(i, 0),
            new vscode.Position(i, line.length)
          );

          const lens = new vscode.CodeLens(range);
          lens.command = {
            title: "🔍 Analyze endpoint",
            command: "devpulse.analyzeEndpoint",
            arguments: [endpoint]
          };

          this.codeLenses.push(lens);
        }
      }
    }

    return this.codeLenses;
  }

  resolveCodeLens?(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens> {
    return codeLens;
  }
}

/**
 * TreeViewProvider
 * Shows API inventory in sidebar tree view
 */
export class ApiTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> =
    new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private data: TreeItem[] = [];

  constructor(private devPulseClient: DevPulseClient) {
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
    this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      const shadowApis = await this.devPulseClient.getShadowApis();
      this.data = [
        new TreeItem("Active Shadow APIs", vscode.TreeItemCollapsibleState.Collapsed, shadowApis.length),
        new TreeItem("Security Alerts", vscode.TreeItemCollapsibleState.Collapsed, 0),
        new TreeItem("Compliance Status", vscode.TreeItemCollapsibleState.Collapsed, 0)
      ];
    } catch (error) {
      console.error("Error loading tree data:", error);
      this.data = [];
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!element) {
      return Promise.resolve(this.data);
    }
    return Promise.resolve([]);
  }
}

class TreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    count?: number
  ) {
    super(label, collapsibleState);
    if (count !== undefined) {
      this.label = `${label} (${count})`;
    }
  }
}

/**
 * CommandProvider
 * Handles command execution and quick fixes
 */
export class CommandProvider {
  constructor(
    private devPulseClient: DevPulseClient,
    private context: vscode.ExtensionContext
  ) {}

  getQuickFixOptions(message: string): string[] {
    if (message.includes("CRITICAL")) {
      return [
        "Immediately disable endpoint",
        "Schedule security audit",
        "Review access logs",
        "Add security team to discussion"
      ];
    } else if (message.includes("HIGH")) {
      return [
        "Restrict access to authorized users",
        "Implement authentication",
        "Document endpoint",
        "Schedule investigation"
      ];
    } else if (message.includes("MEDIUM")) {
      return [
        "Review endpoint",
        "Verify authorization",
        "Add to API documentation",
        "Schedule assessment"
      ];
    }
    return ["Review endpoint", "Update documentation"];
  }

  async executeQuickFix(option: string, diagnostic: vscode.Diagnostic): Promise<void> {
    vscode.window.showInformationMessage(`Executing: ${option}`);
    // Implementation would handle the specific action
  }

  async generateReport(): Promise<string | null> {
    const metrics = await this.devPulseClient.getDashboardMetrics();
    const timestamp = new Date().toISOString();
    const reportPath = `${this.context.globalStorageUri.fsPath}/devpulse-report-${timestamp}.md`;

    const content = `# DevPulse Security Report

Generated: ${new Date().toLocaleString()}

## Summary
- Total Endpoints: ${metrics.total_endpoints || 0}
- Shadow APIs: ${metrics.shadow_apis || 0}
- Security Alerts: ${metrics.security_alerts || 0}

## Risk Distribution
- Critical: ${metrics.critical_count || 0}
- High: ${metrics.high_count || 0}
- Medium: ${metrics.medium_count || 0}
- Low: ${metrics.low_count || 0}

## Compliance Status
- Requirements Met: ${metrics.compliance_met || 0}
- Violations: ${metrics.compliance_violations || 0}

---
*Report generated by DevPulse IDE Extension*
`;

    try {
      // Save report
      return reportPath;
    } catch (error) {
      console.error("Error generating report:", error);
      return null;
    }
  }
}
