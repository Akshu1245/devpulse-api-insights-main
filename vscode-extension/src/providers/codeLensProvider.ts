import * as vscode from "vscode";
import { ApiClient, ScanIssue } from "../services/apiClient";

const API_PATTERN = /https?:\/\/(?:api\.)?[\w.-]+(?:\.\w+)+/g;
const API_KEY_PATTERN =
  /(?:api[_-]?key|apikey|key|token|secret|auth[_-]?token|appid|authorization)\s*[:=]\s*["']?([^\s"']+)?/gi;

export class DevPulseCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private apiStatusMap = new Map<string, { status: string; latency: number }>();

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    this.codeLenses = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const matches = line.text.matchAll(API_PATTERN);

      for (const match of matches) {
        if (match.index !== undefined) {
          const range = new vscode.Range(
            i,
            match.index,
            i,
            match.index + match[0].length
          );
          const apiUrl = match[0];
          const status = this.apiStatusMap.get(apiUrl);

          const codeLens = new vscode.CodeLens(range);
          codeLens.command = {
            title: status
              ? `\u{1F50D} ${status.status.toUpperCase()} | ${status.latency}ms`
              : "\u{1F50D} API (Click to analyze)",
            command: "devpulse.analyzeApi",
            arguments: [apiUrl, range],
          };

          this.codeLenses.push(codeLens);
        }
      }

      const keyMatches = line.text.matchAll(API_KEY_PATTERN);
      for (const match of keyMatches) {
        if (match.index !== undefined) {
          const range = new vscode.Range(
            i,
            match.index,
            i,
            match.index + match[0].length
          );
          const codeLens = new vscode.CodeLens(range);
          codeLens.command = {
            title: "\u26A0\uFE0F POTENTIAL LEAK - Click to scan",
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

export class DevPulseDiagnostics {
  private collection: vscode.DiagnosticCollection;
  private apiClient: ApiClient;
  private scanDebounce: Map<string, NodeJS.Timeout> = new Map();
  private _onScanComplete = new vscode.EventEmitter<{
    uri: vscode.Uri;
    issueCount: number;
  }>();
  readonly onScanComplete = this._onScanComplete.event;

  constructor(
    private context: vscode.ExtensionContext,
    apiClient: ApiClient
  ) {
    this.collection = vscode.languages.createDiagnosticCollection("devpulse");
    this.apiClient = apiClient;
    this.context.subscriptions.push(this.collection);
  }

  scanDocument(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.scanDebounce.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.scanDebounce.delete(key);
      this._performScan(document);
    }, 400);

    this.scanDebounce.set(key, timer);
  }

  async scanDocumentOnSave(document: vscode.TextDocument): Promise<void> {
    const key = document.uri.toString();
    const existing = this.scanDebounce.get(key);
    if (existing) {
      clearTimeout(existing);
      this.scanDebounce.delete(key);
    }

    await this._performScan(document);

    const apiUrls = this._extractApiUrls(document);
    if (apiUrls.length > 0) {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "DevPulse: Probing APIs...",
          cancellable: false,
        },
        async (progress) => {
          const errors = await Promise.allSettled(
            apiUrls.slice(0, 5).map(async (url) => {
              progress.report({ message: `Scanning ${url.slice(0, 50)}...` });
              try {
                const result = await this.apiClient.scanEndpoint(url);
                this._addBackendDiagnostics(document, url, result.issues);
              } catch {
                // Backend unreachable, skip remote scan
              }
            })
          );
        }
      );
    }
  }

  private async _performScan(
    document: vscode.TextDocument
  ): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      const keyPattern =
        /(?:api[_-]?key|apikey|secret|token|authorization|appid)\s*[:=]\s*["']([^\s"']{20,})["']?/gi;
      let match;
      while ((match = keyPattern.exec(line.text)) !== null) {
        const range = new vscode.Range(
          i,
          match.index,
          i,
          match.index + match[0].length
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          "Potential API key or secret detected. Consider using environment variables instead.",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.code = "devpulse-hardcoded-key";
        diagnostic.source = "DevPulse";
        diagnostics.push(diagnostic);
      }

      const awsPattern = /AKIA[A-Z0-9]{16}/g;
      while ((match = awsPattern.exec(line.text)) !== null) {
        const range = new vscode.Range(
          i,
          match.index,
          i,
          match.index + match[0].length
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          "AWS Access Key ID detected. Remove from code immediately.",
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.code = "devpulse-aws-key";
        diagnostic.source = "DevPulse";
        diagnostics.push(diagnostic);
      }

      const privKeyPattern = /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY/g;
      while ((match = privKeyPattern.exec(line.text)) !== null) {
        const range = new vscode.Range(
          i,
          match.index,
          i,
          match.index + match[0].length
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          "Private key detected in source code. Move to secure storage.",
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.code = "devpulse-private-key";
        diagnostic.source = "DevPulse";
        diagnostics.push(diagnostic);
      }

      const httpPattern = /http:\/\/(?!localhost|127\.0\.0\.1)[^\s"']+/g;
      while ((match = httpPattern.exec(line.text)) !== null) {
        const range = new vscode.Range(
          i,
          match.index,
          i,
          match.index + match[0].length
        );
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

    this.collection.set(document.uri, diagnostics);
    this._onScanComplete.fire({
      uri: document.uri,
      issueCount: diagnostics.length,
    });
  }

  private _extractApiUrls(document: vscode.TextDocument): string[] {
    const text = document.getText();
    const urls = new Set<string>();
    let match;
    const pattern = /https?:\/\/(?!localhost)[\w.-]+(?:\.\w+)+(?:\/[^\s"']*)?/g;
    while ((match = pattern.exec(text)) !== null) {
      const url = match[0].replace(/[;"'\]\)>},]*$/, "");
      if (url.length > 10) {
        urls.add(url);
      }
    }
    return [...urls];
  }

  private _addBackendDiagnostics(
    document: vscode.TextDocument,
    apiUrl: string,
    issues: ScanIssue[]
  ): void {
    const existingDiagnostics = this.collection.get(document.uri);
    const diagnostics = existingDiagnostics ? [...existingDiagnostics] : [];
    const text = document.getText();

    for (const issue of issues) {
      const idx = text.indexOf(apiUrl);
      if (idx === -1) continue;
      const pos = document.positionAt(idx);
      const endPos = document.positionAt(idx + apiUrl.length);
      const range = new vscode.Range(pos, endPos);

      const severity =
        issue.risk_level === "critical"
          ? vscode.DiagnosticSeverity.Error
          : issue.risk_level === "high"
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;

      const diagnostic = new vscode.Diagnostic(
        range,
        `${issue.issue}. ${issue.recommendation}`,
        severity
      );
      diagnostic.code = `devpulse-backend-${issue.risk_level}`;
      diagnostic.source = "DevPulse";
      diagnostics.push(diagnostic);
    }

    this.collection.set(document.uri, diagnostics);
  }

  clear(uri?: vscode.Uri): void {
    if (uri) {
      this.collection.delete(uri);
    } else {
      this.collection.clear();
    }
  }
}