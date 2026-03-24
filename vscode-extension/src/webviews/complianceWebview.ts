import * as vscode from "vscode";
import { DevPulseClient } from "../services/devPulseClient";

export class ComplianceWebview {
  private panel?: vscode.WebviewPanel;

  constructor(
    private devPulseClient: DevPulseClient,
    private context: vscode.ExtensionContext
  ) {}

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "devpulseCompliance",
      "DevPulse Compliance Status",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = await this.getHtmlContent();
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private async getHtmlContent(): Promise<string> {
    const requirements = await this.devPulseClient.getComplianceRequirements();

    const requirementRows = requirements
      .map(
        (req: any) => `
      <tr>
        <td>${req.requirement_id}</td>
        <td>${req.title}</td>
        <td style="color: ${req.status === 'compliant' ? '#4ec9b0' : '#f44747'}">
          ${req.status?.toUpperCase() || 'UNKNOWN'}
        </td>
      </tr>
    `
      )
      .join("");

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DevPulse Compliance</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
        }
        h1 { margin-bottom: 20px; color: #4ec9b0; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-editor-lineHighlightBorder);
        }
        th { 
            background: var(--vscode-editor-inlineValue-background);
            color: #4ec9b0;
            font-weight: 600;
        }
        tr:hover {
            background: var(--vscode-editor-inlineValue-background);
        }
        .compliant { color: #4ec9b0; font-weight: bold; }
        .non-compliant { color: #f44747; font-weight: bold; }
    </style>
</head>
<body>
    <h1>📋 Compliance Status</h1>
    
    <table>
        <thead>
            <tr>
                <th>Requirement ID</th>
                <th>Title</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${requirementRows || '<tr><td colspan="3">No requirements loaded</td></tr>'}
        </tbody>
    </table>

    <button onclick="alert('Report generation coming soon!');" style="padding: 10px 20px; background: #4ec9b0; color: #000; border: none; border-radius: 4px; cursor: pointer;">
        📊 Export Compliance Report
    </button>
</body>
</html>`;
  }
}
