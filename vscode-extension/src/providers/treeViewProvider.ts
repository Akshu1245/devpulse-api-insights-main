import * as vscode from "vscode";
import { DevPulseClient } from "../services/devPulseClient";

export interface TreeItem extends vscode.TreeItem {
  id?: string;
  data?: any;
}

export class ApiTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> =
    new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(private devPulseClient: DevPulseClient) {
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    return [];
  }

  private async getRootItems(): Promise<TreeItem[]> {
    try {
      const shadowApis = await this.devPulseClient.getShadowApis();
      const alerts = await this.devPulseClient.getSecurityAlerts();

      return [
        {
          label: `🔴 Active Shadow APIs (${shadowApis.length})`,
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          id: "shadow_apis"
        },
        {
          label: `⚠️ Security Alerts (${alerts.length})`,
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          id: "alerts"
        }
      ];
    } catch (error) {
      console.error("Error loading tree items:", error);
      return [];
    }
  }
}
