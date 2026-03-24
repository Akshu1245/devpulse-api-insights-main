import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DevPulseClient } from "../services/devPulseClient";

/**
 * DiagnosticProvider
 * Provides inline diagnostics for API endpoints with risk indicators
 */
export class DiagnosticProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private readonly apiPatterns = [
    /(?:fetch|axios|http\.(?:get|post|put|delete|patch))\s*\(\s*['"](.*?)['"]/, // fetch, axios, http calls
    /endpoint\s*[:=]\s*['"](.*?)['"]/, // endpoint definitions
    /url\s*[:=]\s*['"](.*?)['"]/, // URL definitions
    /path\s*[:=]\s*['"](.*?)['"]/, // path definitions
    /const\s+\w+\s*=\s*['"](\/api\/[^'"]*)/  // API paths
  ];

  constructor(private devPulseClient: DevPulseClient, context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("devpulse");
    context.subscriptions.push(this.diagnosticCollection);
  }

  registerDiagnostics(context: vscode.ExtensionContext): void {
    // Scan open documents on activation
    for (const editor of vscode.window.visibleTextEditors) {
      this.scanActiveFile(editor.document);
    }

    // Watch for document changes
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        this.scanActiveFile(doc);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.scanActiveFile(event.document);
      })
    );
  }

  async scanActiveFile(document: vscode.TextDocument): Promise<void> {
    if (!this.isAnalyzableFile(document)) {
      return;
    }

    try {
      const diagnostics = await this.analyzeDocument(document);
      this.diagnosticCollection.set(document.uri, diagnostics);
    } catch (error) {
      console.error("Error scanning file:", error);
    }
  }

  async scanProject(): Promise<void> {
    const filePattern = "**/*.{ts,tsx,js,jsx,json}";
    const files = await vscode.workspace.findFiles(filePattern);

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        await this.scanActiveFile(document);
      } catch (error) {
        console.error(`Error scanning file ${file}:`, error);
      }
    }

    vscode.window.showInformationMessage(`DevPulse: Scanned ${files.length} files`);
  }

  private isAnalyzableFile(document: vscode.TextDocument): boolean {
    const language = document.languageId;
    return ["typescript", "typescriptreact", "javascript", "javascriptreact", "json"].includes(language);
  }

  private async analyzeDocument(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for API endpoints
      for (const pattern of this.apiPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const endpoint = match[1];

          // Skip if not an API path
          if (!this.isApiEndpoint(endpoint)) {
            continue;
          }

          // Analyze the endpoint
          const risk = await this.devPulseClient.analyzeApiRisk(endpoint);
          if (risk) {
            const diagnostic = this.createDiagnostic(
              document,
              i,
              line,
              match[0],
              endpoint,
              risk
            );
            diagnostics.push(diagnostic);
          }
        }
      }
    }

    return diagnostics;
  }

  private isApiEndpoint(endpoint: string): boolean {
    // Check if it looks like an API endpoint
    return endpoint.startsWith("/api/") || 
           endpoint.startsWith("http://") || 
           endpoint.startsWith("https://") ||
           endpoint.includes("endpoint") ||
           endpoint.includes("url");
  }

  private createDiagnostic(
    document: vscode.TextDocument,
    lineNum: number,
    line: string,
    match: string,
    endpoint: string,
    risk: any
  ): vscode.Diagnostic {
    const startChar = line.indexOf(match);
    const range = new vscode.Range(
      new vscode.Position(lineNum, startChar),
      new vscode.Position(lineNum, startChar + match.length)
    );

    const riskLevel = risk.risk_level || "unknown";
    const riskScore = risk.risk_score || 0;

    let severity = vscode.DiagnosticSeverity.Information;
    if (riskLevel === "critical") {
      severity = vscode.DiagnosticSeverity.Error;
    } else if (riskLevel === "high") {
      severity = vscode.DiagnosticSeverity.Warning;
    } else if (riskLevel === "medium") {
      severity = vscode.DiagnosticSeverity.Information;
    }

    const message = `DevPulse API Risk: ${endpoint} [${riskLevel.toUpperCase()} - Score: ${riskScore}]`;

    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.code = "devpulse-api-risk";
    diagnostic.source = "DevPulse";

    // Add related information
    if (risk.compliance && risk.compliance.length > 0) {
      diagnostic.relatedInformation = [
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(document.uri, range.start),
          `Affects compliance: ${risk.compliance.join(", ")}`
        )
      ];
    }

    return diagnostic;
  }
}
