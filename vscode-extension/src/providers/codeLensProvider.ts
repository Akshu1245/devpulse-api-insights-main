import * as vscode from "vscode";

/**
 * DevPulse Code Lens Provider
 * Shows inline API health and warnings right in the editor
 */

const API_PATTERN = /https?:\/\/(?:api\.)?[\w.-]+(?:\.\w+)+/g;
const API_KEY_PATTERN =
  /(?:api[_-]?key|apikey|key|token|secret|auth[_-]?token|appid|authorization)\s*[:=]\s*["\']?([^\s"\']+)?/gi;

export class DevPulseCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private apiStatusMap = new Map<string, { status: string; latency: number }>();

  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
    this.codeLenses = [];

    // Scan for API calls
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const matches = line.text.matchAll(API_PATTERN);

      for (const match of matches) {
        if (match.index !== undefined) {
          const range = new vscode.Range(i, match.index, i, match.index + match[0].length);
          const apiUrl = match[0];
          const status = this.apiStatusMap.get(apiUrl);

          const codeLens = new vscode.CodeLens(range);
          codeLens.command = {
            title: status
              ? `🔍 ${status.status.toUpperCase()} | ${status.latency}ms`
              : "🔍 API (Click to analyze)",
            command: "devpulse.analyzeApi",
            arguments: [apiUrl, range],
          };

          this.codeLenses.push(codeLens);
        }
      }

      // Scan for hardcoded API keys
      const keyMatches = line.text.matchAll(API_KEY_PATTERN);
      for (const match of keyMatches) {
        if (match.index !== undefined) {
          const range = new vscode.Range(i, match.index, i, match.index + match[0].length);
          const codeLens = new vscode.CodeLens(range);
          codeLens.command = {
            title: "⚠️ POTENTIAL LEAK - Click to scan",
            command: "devpulse.scanForLeaks",
            arguments: [document.uri, range],
          };

          this.codeLenses.push(codeLens);
        }
      }
    }

    return this.codeLenses;
  }

  updateApiStatus(url: string, status: string, latency: number): void {
    this.apiStatusMap.set(url, { status, latency });
  }

  clearApiStatus(): void {
    this.apiStatusMap.clear();
  }
}

/**
 * Diagnostic provider for real-time API issue detection
 */
export class DevPulseDiagnostics {
  private diagnostics: Map<string, vscode.Diagnostic[]> = new Map();
  private collection: vscode.DiagnosticCollection;

  constructor(private context: vscode.ExtensionContext) {
    this.collection = vscode.languages.createDiagnosticCollection("devpulse");
    this.context.subscriptions.push(this.collection);
  }

  scanDocument(document: vscode.TextDocument): void {
    const diagnostics: vscode.Diagnostic[] = [];

    // Check for hardcoded API keys
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const keyPattern =
        /(?:api[_-]?key|apikey|secret|token|authorization|appid)\s*[:=]\s*["\']([^\s"\']{20,})["\']?/gi;
      let match;

      while ((match = keyPattern.exec(line.text)) !== null) {
        const range = new vscode.Range(i, match.index, i, match.index + match[0].length);
        const diagnostic = new vscode.Diagnostic(
          range,
          "Potential API key or secret detected. Consider using environment variables instead.",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.code = "devpulse-hardcoded-key";
        diagnostic.source = "DevPulse";

        const fixAction = new vscode.CodeAction("Move to environment variable", vscode.CodeActionKind.QuickFix);
        fixAction.edit = new vscode.WorkspaceEdit();

        diagnostics.push(diagnostic);
      }
    }

    // Check for HTTP URLs (should be HTTPS)
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const httpPattern = /http:\/\/(?!localhost)[^\s]+/g;
      let match;

      while ((match = httpPattern.exec(line.text)) !== null) {
        const range = new vscode.Range(i, match.index, i, match.index + match[0].length);
        const diagnostic = new vscode.Diagnostic(
          range,
          "Non-local HTTP URL detected. Consider using HTTPS for security.",
          vscode.DiagnosticSeverity.Information
        );
        diagnostic.code = "devpulse-http-api";
        diagnostic.source = "DevPulse";
        diagnostics.push(diagnostic);
      }
    }

    // Update collection
    this.diagnostics.set(document.uri.toString(), diagnostics);
    this.collection.set(document.uri, diagnostics);
  }

  clear(uri?: vscode.Uri): void {
    if (uri) {
      this.diagnostics.delete(uri.toString());
      this.collection.delete(uri);
    } else {
      this.diagnostics.clear();
      this.collection.clear();
    }
  }
}
