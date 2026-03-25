import * as vscode from "vscode";

/**
 * DevPulse Tree View Provider
 * Shows API registry, health status, and insights in a tree structure
 */

export interface APINode {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latency?: number;
  uptime?: number;
  description?: string;
  requiresKey?: boolean;
}

export interface InsightNode {
  title: string;
  severity: "info" | "warning" | "error";
  count: number;
  description: string;
}

export class DevPulseTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private apiNodes: APINode[] = [];
  private insightNodes: InsightNode[] = [];
  private workspaceStats = { apiUsage: 0, leaks: 0, incidents: 0 };

  constructor() {
    // Initialize empty; data comes from web app via messages
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!element) {
      // Root level: show main categories
      return Promise.resolve([
        new TreeItem("📊 Workspace Stats", vscode.TreeItemCollapsibleState.Collapsed, "stats", "#4ade80"),
        new TreeItem("🔌 API Registry", vscode.TreeItemCollapsibleState.Collapsed, "registry", "#60a5fa"),
        new TreeItem("⚠️ Insights", vscode.TreeItemCollapsibleState.Collapsed, "insights", "#f59e0b"),
        new TreeItem("🐛 Recent Issues", vscode.TreeItemCollapsibleState.Collapsed, "issues", "#ef4444"),
      ]);
    }

    switch (element.contextValue) {
      case "stats":
        return Promise.resolve([
          new TreeItem(
            `APIs Found: ${this.workspaceStats.apiUsage}`,
            vscode.TreeItemCollapsibleState.None,
            "stat",
            "#4ade80"
          ),
          new TreeItem(
            `Potential Leaks: ${this.workspaceStats.leaks}`,
            vscode.TreeItemCollapsibleState.None,
            "stat",
            this.workspaceStats.leaks > 0 ? "#ef4444" : "#4ade80"
          ),
          new TreeItem(
            `Down Events: ${this.workspaceStats.incidents}`,
            vscode.TreeItemCollapsibleState.None,
            "stat",
            this.workspaceStats.incidents > 0 ? "#f59e0b" : "#4ade80"
          ),
        ]);

      case "registry":
        return Promise.resolve(
          this.apiNodes.map(
            (api) =>
              new TreeItem(
                `${this.getStatusIcon(api.status)} ${api.name}`,
                vscode.TreeItemCollapsibleState.None,
                "api",
                this.getStatusColor(api.status)
              )
          )
        );

      case "insights":
        return Promise.resolve(
          this.insightNodes.map(
            (insight) =>
              new TreeItem(
                `${this.getSeverityIcon(insight.severity)} ${insight.title} (${insight.count})`,
                vscode.TreeItemCollapsibleState.None,
                "insight",
                this.getSeverityColor(insight.severity)
              )
          )
        );

      case "issues":
        return Promise.resolve([
          new TreeItem("Run workspace scan to populate", vscode.TreeItemCollapsibleState.None, "issue", "#999999"),
        ]);

      default:
        return Promise.resolve([]);
    }
  }

  updateStats(stats: { apiUsage: number; leaks: number; incidents: number }): void {
    this.workspaceStats = stats;
    this._onDidChangeTreeData.fire(null);
  }

  updateAPIs(apis: APINode[]): void {
    this.apiNodes = apis;
    this._onDidChangeTreeData.fire(null);
  }

  updateInsights(insights: InsightNode[]): void {
    this.insightNodes = insights;
    this._onDidChangeTreeData.fire(null);
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case "healthy":
        return "✅";
      case "degraded":
        return "⚠️";
      case "down":
        return "⛔";
      default:
        return "❓";
    }
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case "healthy":
        return "#4ade80";
      case "degraded":
        return "#f59e0b";
      case "down":
        return "#ef4444";
      default:
        return "#999999";
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case "error":
        return "🔴";
      case "warning":
        return "🟡";
      case "info":
        return "🔵";
      default:
        return "⚪";
    }
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case "error":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      case "info":
        return "#3b82f6";
      default:
        return "#999999";
    }
  }
}

export class TreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    contextValue?: string,
    color?: string
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    if (color) {
      this.iconPath = new vscode.ThemeColor(color);
    }
  }
}
