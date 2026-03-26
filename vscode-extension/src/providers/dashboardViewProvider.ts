import * as vscode from "vscode";
import { ApiClient, Alert, ScanRecord } from "../services/apiClient";

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "devpulse.sidebarView";
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly apiClient: ApiClient,
    private readonly state: { workspaceStats: { apiUsage: number; leaks: number; incidents: number } }
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webview.html = this._getHtml(webview);

    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "scanEndpoint":
          await this._handleScanEndpoint(message.endpoint);
          break;
        case "refreshAlerts":
          await this._sendAlerts();
          break;
        case "refreshScans":
          await this._sendScans();
          break;
        case "checkHealth":
          await this._sendHealthStatus();
          break;
        case "scanWorkspace":
          await vscode.commands.executeCommand("devpulse.scanWorkspace");
          break;
        case "scanDocument":
          await vscode.commands.executeCommand("devpulse.scanDocument");
          break;
        case "openPanel":
          await vscode.commands.executeCommand("devpulse.openPanel");
          break;
        case "resolveAlert":
          await this._handleResolveAlert(message.alertId);
          break;
        case "openExternal":
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
      }
    });

    // Send initial data
    this._sendHealthStatus();
    this._sendAlerts();
    this._sendStats();
  }

  postMessage(message: unknown): Thenable<boolean> {
    return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
  }

  refresh(): void {
    if (this.view) {
      this._sendHealthStatus();
      this._sendAlerts();
      this._sendStats();
    }
  }

  updateStats(stats: { apiUsage: number; leaks: number; incidents: number }): void {
    this.state.workspaceStats = stats;
    this.postMessage({ type: "stats", payload: stats });
  }

  private async _handleScanEndpoint(endpoint: string): Promise<void> {
    if (!endpoint) {
      vscode.window.showWarningMessage("Enter an API endpoint to scan.");
      return;
    }
    try {
      this.postMessage({ type: "scanStarted", payload: { endpoint } });
      const result = await this.apiClient.scanEndpoint(endpoint);
      this.postMessage({ type: "scanResult", payload: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: "scanError", payload: { error: msg } });
      vscode.window.showErrorMessage(`DevPulse scan failed: ${msg}`);
    }
  }

  private async _handleResolveAlert(alertId: string): Promise<void> {
    try {
      await this.apiClient.resolveAlert(alertId);
      this.postMessage({ type: "alertResolved", payload: { alertId } });
      await this._sendAlerts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to resolve alert: ${msg}`);
    }
  }

  private async _sendHealthStatus(): Promise<void> {
    try {
      const health = await this.apiClient.healthCheck();
      this.postMessage({ type: "health", payload: { connected: true, ...health } });
    } catch {
      this.postMessage({
        type: "health",
        payload: { connected: false, status: "unreachable" },
      });
    }
  }

  private async _sendAlerts(): Promise<void> {
    try {
      const { alerts } = await this.apiClient.getAlerts();
      this.postMessage({ type: "alerts", payload: alerts });
    } catch {
      this.postMessage({ type: "alerts", payload: [] });
    }
  }

  private async _sendScans(): Promise<void> {
    try {
      const { scans } = await this.apiClient.getScans();
      this.postMessage({ type: "scans", payload: scans });
    } catch {
      this.postMessage({ type: "scans", payload: [] });
    }
  }

  private _sendStats(): void {
    this.postMessage({ type: "stats", payload: this.state.workspaceStats });
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "devpulse.svg")
    );

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>DevPulse</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --card-bg: var(--vscode-editorWidget-background);
      --border: var(--vscode-panel-border);
      --accent: #7c3aed;
      --accent-light: #a78bfa;
      --green: #22c55e;
      --yellow: #eab308;
      --red: #ef4444;
      --blue: #3b82f6;
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      padding: 0;
    }
    .header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--card-bg);
    }
    .header img { width: 20px; height: 20px; }
    .header h1 { font-size: 14px; font-weight: 600; flex: 1; }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      display: inline-block;
    }
    .status-dot.connected { background: var(--green); }
    .status-dot.disconnected { background: var(--red); }
    .status-dot.checking { background: var(--yellow); animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    .section {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    .section-title {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px; font-weight: 600;
    }

    .stats-grid {
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .stat-card {
      background: var(--card-bg); border: 1px solid var(--border);
      border-radius: 6px; padding: 8px; text-align: center;
    }
    .stat-value {
      font-size: 20px; font-weight: 700;
      line-height: 1.2;
    }
    .stat-label {
      font-size: 10px; color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .scan-form {
      display: flex; gap: 6px;
    }
    .scan-form input {
      flex: 1; padding: 6px 8px;
      background: var(--input-bg); color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px; font-size: 12px;
      outline: none;
    }
    .scan-form input:focus { border-color: var(--accent); }
    .scan-form button, .btn {
      padding: 6px 12px;
      background: var(--btn-bg); color: var(--btn-fg);
      border: none; border-radius: 4px;
      cursor: pointer; font-size: 12px;
      font-family: var(--vscode-font-family);
    }
    .scan-form button:hover, .btn:hover { background: var(--btn-hover); }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }
    .btn-secondary:hover { background: var(--card-bg); }

    .actions-row {
      display: flex; gap: 6px; margin-top: 8px;
    }

    .alert-item {
      background: var(--card-bg); border: 1px solid var(--border);
      border-left: 3px solid var(--red);
      border-radius: 4px; padding: 8px 10px;
      margin-bottom: 6px; font-size: 12px;
    }
    .alert-item.medium { border-left-color: var(--yellow); }
    .alert-item.low { border-left-color: var(--blue); }
    .alert-header {
      display: flex; justify-content: space-between; align-items: center;
    }
    .alert-severity {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      padding: 1px 6px; border-radius: 3px;
      background: var(--badge-bg); color: var(--badge-fg);
    }
    .alert-desc { margin-top: 4px; opacity: 0.9; }
    .alert-endpoint { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
    .alert-actions { margin-top: 6px; display: flex; gap: 4px; }

    .scan-result {
      background: var(--card-bg); border: 1px solid var(--border);
      border-radius: 4px; padding: 8px 10px;
      margin-bottom: 6px; font-size: 12px;
    }
    .scan-result-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 6px;
    }
    .issue-item {
      padding: 4px 0;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
    }
    .issue-item:last-child { border-bottom: none; }
    .issue-risk {
      display: inline-block; font-size: 9px; font-weight: 700;
      padding: 1px 4px; border-radius: 2px;
      text-transform: uppercase; margin-right: 4px;
    }
    .issue-risk.critical { background: var(--red); color: white; }
    .issue-risk.high { background: #f97316; color: white; }
    .issue-risk.medium { background: var(--yellow); color: black; }
    .issue-risk.low { background: var(--blue); color: white; }

    .loading {
      text-align: center; padding: 16px;
      color: var(--vscode-descriptionForeground);
    }
    .empty {
      text-align: center; padding: 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .hidden { display: none !important; }

    .spinner {
      display: inline-block; width: 12px; height: 12px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${iconUri}" alt="DevPulse" />
    <h1>DevPulse</h1>
    <span id="statusDot" class="status-dot checking" title="Checking..."></span>
  </div>

  <div class="section">
    <div class="section-title">Connection</div>
    <div id="healthStatus" style="font-size: 12px;">
      <span class="spinner"></span> Checking backend...
    </div>
  </div>

  <div class="section">
    <div class="section-title">Workspace Stats</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" id="statApis" style="color: var(--blue);">0</div>
        <div class="stat-label">APIs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statLeaks" style="color: var(--red);">0</div>
        <div class="stat-label">Leaks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statIncidents" style="color: var(--yellow);">0</div>
        <div class="stat-label">Issues</div>
      </div>
    </div>
    <div class="actions-row">
      <button class="btn" id="btnScanWorkspace">Scan Workspace</button>
      <button class="btn btn-secondary" id="btnScanFile">Scan File</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Quick Scan</div>
    <div class="scan-form">
      <input type="text" id="endpointInput" placeholder="https://api.example.com" />
      <button id="btnScan">Scan</button>
    </div>
    <div id="scanResults"></div>
  </div>

  <div class="section">
    <div class="section-title">
      Active Alerts
      <button class="btn btn-secondary" id="btnRefreshAlerts" style="float:right; padding: 2px 8px; font-size: 10px;">Refresh</button>
    </div>
    <div id="alertsContainer">
      <div class="empty">No alerts loaded</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Open DevPulse</div>
    <button class="btn" id="btnOpenPanel" style="width: 100%;">Open Full Panel</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const $ = (s) => document.querySelector(s);

    function setHealth(connected, info) {
      const dot = $('#statusDot');
      const status = $('#healthStatus');
      dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
      dot.title = connected ? 'Connected' : 'Disconnected';
      status.innerHTML = connected
        ? 'Backend connected <span style="color: var(--green);">\u2713</span>'
        : 'Backend unreachable <span style="color: var(--red);">\u2717</span> <button class="btn btn-secondary" onclick="checkHealth()" style="margin-left:8px; padding:2px 8px; font-size:10px;">Retry</button>';
    }

    function setStats(stats) {
      if (!stats) return;
      $('#statApis').textContent = stats.apiUsage || 0;
      $('#statLeaks').textContent = stats.leaks || 0;
      $('#statIncidents').textContent = stats.incidents || 0;
    }

    function renderAlerts(alerts) {
      const container = $('#alertsContainer');
      if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="empty">No active alerts \u2713</div>';
        return;
      }
      container.innerHTML = alerts.map(a => {
        const sevClass = a.severity === 'critical' ? '' : a.severity;
        return '<div class="alert-item ' + sevClass + '">' +
          '<div class="alert-header">' +
            '<span class="alert-severity">' + escHtml(a.severity) + '</span>' +
            '<span style="font-size:10px;color:var(--vscode-descriptionForeground)">' + escHtml(timeAgo(a.created_at)) + '</span>' +
          '</div>' +
          '<div class="alert-desc">' + escHtml(a.description) + '</div>' +
          '<div class="alert-endpoint">' + escHtml(a.endpoint || '') + '</div>' +
          '<div class="alert-actions">' +
            '<button class="btn btn-secondary" onclick="resolveAlert(\'' + escHtml(a.id) + '\')" style="padding:2px 8px;font-size:10px;">Resolve</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderScanResult(result) {
      const container = $('#scanResults');
      if (!result || !result.issues) {
        container.innerHTML = '<div class="empty">No issues found \u2713</div>';
        return;
      }
      const issues = result.issues;
      container.innerHTML = '<div class="scan-result">' +
        '<div class="scan-result-header">' +
          '<strong>' + escHtml(result.endpoint) + '</strong>' +
          '<span style="font-size:11px;">' + issues.length + ' issues</span>' +
        '</div>' +
        issues.map(i => '<div class="issue-item">' +
          '<span class="issue-risk ' + i.risk_level + '">' + escHtml(i.risk_level) + '</span> ' +
          escHtml(i.issue) +
          '<div style="color:var(--vscode-descriptionForeground);font-size:10px;margin-top:2px;">' + escHtml(i.recommendation) + '</div>' +
        '</div>').join('') +
      '</div>';
    }

    function checkHealth() {
      vscode.postMessage({ type: 'checkHealth' });
    }

    function resolveAlert(id) {
      vscode.postMessage({ type: 'resolveAlert', alertId: id });
    }

    function escHtml(s) {
      if (!s) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function timeAgo(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s/60) + 'm ago';
      if (s < 86400) return Math.floor(s/3600) + 'h ago';
      return Math.floor(s/86400) + 'd ago';
    }

    $('#btnScan').addEventListener('click', () => {
      const endpoint = $('#endpointInput').value.trim();
      if (!endpoint) return;
      $('#scanResults').innerHTML = '<div class="loading"><span class="spinner"></span> Scanning...</div>';
      vscode.postMessage({ type: 'scanEndpoint', endpoint });
    });

    $('#endpointInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#btnScan').click();
    });

    $('#btnScanWorkspace').addEventListener('click', () => {
      vscode.postMessage({ type: 'scanWorkspace' });
    });

    $('#btnScanFile').addEventListener('click', () => {
      vscode.postMessage({ type: 'scanDocument' });
    });

    $('#btnRefreshAlerts').addEventListener('click', () => {
      $('#alertsContainer').innerHTML = '<div class="loading"><span class="spinner"></span></div>';
      vscode.postMessage({ type: 'refreshAlerts' });
    });

    $('#btnOpenPanel').addEventListener('click', () => {
      vscode.postMessage({ type: 'openPanel' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case 'health':
          setHealth(msg.payload.connected, msg.payload);
          break;
        case 'stats':
          setStats(msg.payload);
          break;
        case 'alerts':
          renderAlerts(msg.payload);
          break;
        case 'scanResult':
          renderScanResult(msg.payload);
          break;
        case 'scanError':
          $('#scanResults').innerHTML = '<div class="empty" style="color:var(--red);">Scan failed: ' + escHtml(msg.payload.error) + '</div>';
          break;
        case 'scanStarted':
          $('#scanResults').innerHTML = '<div class="loading"><span class="spinner"></span> Scanning ' + escHtml(msg.payload.endpoint) + '...</div>';
          break;
        case 'alertResolved':
          break;
      }
    });

    checkHealth();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
