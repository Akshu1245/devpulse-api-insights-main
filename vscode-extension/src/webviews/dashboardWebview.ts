import * as vscode from "vscode";
import * as path from "path";
import { DevPulseClient } from "../services/devPulseClient";

export class DashboardWebview {
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
      "devpulseDashboard",
      "DevPulse Security Dashboard",
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
    const metrics = await this.devPulseClient.getDashboardMetrics();

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DevPulse Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
        }
        h1 { margin-bottom: 20px; color: #4ec9b0; }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 30px;
        }
        .card {
            background: var(--vscode-editor-inlineValue-background);
            border: 1px solid var(--vscode-editor-lineHighlightBorder);
            border-radius: 8px;
            padding: 16px;
        }
        .card-title { 
            font-size: 12px; 
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .card-value {
            font-size: 24px;
            font-weight: bold;
            color: #4ec9b0;
        }
        .critical { color: #f44747; }
        .high { color: #dcdcaa; }
        .medium { color: #569cd6; }
        .low { color: #4ec9b0; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 16px; margin-bottom: 15px; color: #4ec9b0; }
    </style>
</head>
<body>
    <h1>🛡️ DevPulse Security Dashboard</h1>
    
    <div class="grid">
        <div class="card">
            <div class="card-title">Total Endpoints</div>
            <div class="card-value">${metrics.total_endpoints || 0}</div>
        </div>
        <div class="card">
            <div class="card-title">Shadow APIs</div>
            <div class="card-value critical">${metrics.shadow_apis || 0}</div>
        </div>
        <div class="card">
            <div class="card-title">Security Alerts</div>
            <div class="card-value critical">${metrics.security_alerts || 0}</div>
        </div>
        <div class="card">
            <div class="card-title">Compliance Score</div>
            <div class="card-value">${metrics.compliance_score || 0}%</div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Risk Distribution</div>
        <div class="grid">
            <div class="card">
                <div class="card-title">Critical</div>
                <div class="card-value critical">${metrics.critical_count || 0}</div>
            </div>
            <div class="card">
                <div class="card-title">High</div>
                <div class="card-value high">${metrics.high_count || 0}</div>
            </div>
            <div class="card">
                <div class="card-title">Medium</div>
                <div class="card-value medium">${metrics.medium_count || 0}</div>
            </div>
            <div class="card">
                <div class="card-title">Low</div>
                <div class="card-value low">${metrics.low_count || 0}</div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Compliance Status</div>
        <div class="grid">
            <div class="card">
                <div class="card-title">Requirements Met</div>
                <div class="card-value">${metrics.compliance_met || 0}</div>
            </div>
            <div class="card">
                <div class="card-title">Violations</div>
                <div class="card-value critical">${metrics.compliance_violations || 0}</div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }
}
