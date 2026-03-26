import * as vscode from "vscode";
import { DevPulseTreeDataProvider } from "./providers/treeViewProvider";
import { DevPulseCodeLensProvider, DevPulseDiagnostics } from "./providers/codeLensProvider";
import { WorkspaceScanner } from "./services/workspaceScanner";
import { ShadowApiScanner } from "./services/shadowApiScanner";
import { ApiClient } from "./services/apiClient";

type DevPulseWebviewPayload =
  | { type: "devpulse:hostReady"; payload: { workspaceName?: string } }
  | { type: "devpulse:editorContext"; payload: EditorContext }
  | { type: "devpulse:analyzeSelection"; payload: EditorContext }
  | { type: "devpulse:theme"; payload: { kind: vscode.ColorThemeKind } };

interface EditorContext {
  filePath?: string;
  languageId?: string;
  relativePath?: string;
  workspaceFolder?: string;
  selectedText?: string;
  selectionStartLine?: number;
  selectionEndLine?: number;
  cursorLine?: number;
}

interface DevPulseWebviewTarget {
  reveal(): void;
  postMessage(payload: DevPulseWebviewPayload): Thenable<boolean>;
}

class DevPulseViewProvider implements vscode.WebviewViewProvider, DevPulseWebviewTarget {
  public static readonly viewType = "devpulse.sidebarView";
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri, private readonly state: ExtensionState) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = { enableScripts: true };
    webview.html = getWebviewHtml(webview, this.extensionUri, this.state.webAppUrl);

    webview.onDidReceiveMessage((message) => handleWebviewMessage(message));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  reveal(): void {
    this.view?.show?.(true);
  }

  postMessage(payload: DevPulseWebviewPayload): Thenable<boolean> {
    return this.view?.webview.postMessage(payload) ?? Promise.resolve(false);
  }
}

class DevPulsePanel implements DevPulseWebviewTarget {
  private panel?: vscode.WebviewPanel;
  constructor(private readonly extensionUri: vscode.Uri, private readonly state: ExtensionState) {}

  reveal(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "devpulse.panel",
      "DevPulse",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.extensionUri, this.state.webAppUrl);
    this.panel.webview.onDidReceiveMessage((message) => handleWebviewMessage(message));
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  postMessage(payload: DevPulseWebviewPayload): Thenable<boolean> {
    return this.panel?.webview.postMessage(payload) ?? Promise.resolve(false);
  }
}

class ExtensionState {
  private static readonly defaultWebAppUrl = "http://localhost:8080";

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("devpulse");
  }

  get webAppUrl(): string {
    const configured = this.config.get<string>("webAppUrl")?.trim();
    return configured && configured.length > 0 ? configured : ExtensionState.defaultWebAppUrl;
  }

  get hasCustomWebAppUrl(): boolean {
    const configured = this.config.get<string>("webAppUrl");
    return Boolean(configured && configured.trim().length > 0 && configured.trim() !== ExtensionState.defaultWebAppUrl);
  }

  isUsingDefaultLocalUrl(): boolean {
    return this.webAppUrl === ExtensionState.defaultWebAppUrl;
  }

  get autoSyncEditorContext(): boolean {
    return this.config.get<boolean>("autoSyncEditorContext", true);
  }

  get maxSelectionChars(): number {
    return this.config.get<number>("maxSelectionChars", 12000);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const state = new ExtensionState();
  const provider = new DevPulseViewProvider(context.extensionUri, state);
  const panel = new DevPulsePanel(context.extensionUri, state);
  const targets: DevPulseWebviewTarget[] = [provider, panel];

  // Initialize new powerful features
  const apiClient = new ApiClient();
  const treeDataProvider = new DevPulseTreeDataProvider();
  const codeLensProvider = new DevPulseCodeLensProvider();
  const diagnostics = new DevPulseDiagnostics(context, apiClient);
  const scanner = new WorkspaceScanner();
  const shadowApiScanner = new ShadowApiScanner();

  // Register tree view
  vscode.window.registerTreeDataProvider("devpulse.insights", treeDataProvider);
  context.subscriptions.push(vscode.languages.registerCodeLensProvider("*", codeLensProvider));

  const maybePromptConfigureUrl = async (): Promise<void> => {
    const promptedKey = "devpulse.promptedConfigureWebAppUrl";
    const firstRunKey = "devpulse.firstRunComplete";
    
    // Don't prompt again if already configured or if this is first run
    if (state.hasCustomWebAppUrl || context.globalState.get<boolean>(firstRunKey)) {
      return;
    }

    // Mark first run as complete
    await context.globalState.update(firstRunKey, true);

    const configureLabel = "Configure Deployed URL";
    const keepDefaultLabel = "Continue with Localhost";
    const learnMoreLabel = "Learn More";

    const choice = await vscode.window.showInformationMessage(
      "Welcome to DevPulse! Would you like to configure a live web app URL?",
      { detail: "You can change this later in the extension settings.", modal: true },
      configureLabel,
      keepDefaultLabel,
      learnMoreLabel
    );

    switch (choice) {
      case configureLabel:
        await vscode.commands.executeCommand("devpulse.configureWebAppUrl");
        break;
      case learnMoreLabel:
        void vscode.env.openExternal(vscode.Uri.parse("https://devpulse.ai/vscode-setup"));
        break;
      case keepDefaultLabel:
      default:
        // Do nothing, keep default localhost
        break;
    }
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DevPulseViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devpulse.openPanel", () => {
      void maybePromptConfigureUrl();
      panel.reveal();
      void broadcast(targets, hostReadyPayload());
      void broadcast(targets, themePayload(vscode.window.activeColorTheme.kind));
    }),
    vscode.commands.registerCommand("devpulse.configureWebAppUrl", async () => {
      const value = await vscode.window.showInputBox({
        prompt: "Enter your DevPulse web app URL",
        placeHolder: "https://devpulse.your-domain.com",
        value: state.webAppUrl,
        ignoreFocusOut: true,
        validateInput: (input) => {
          const trimmed = input.trim();
          
          // Block localhost and private IP range URLs outside of development
          const localhostPatterns = [
            /^(http|https):\/\/localhost(:\d+)?$/,
            /^(http|https):\/\/127\.0\.0\.1(:\d+)?$/,
            /^(http|https):\/\/\[::1\](:\d+)?$/
          ];

          try {
            const parsed = new URL(trimmed);
            
            // Validate protocol
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
              return "URL must start with http:// or https://";
            }

            // Block reserved/private domain patterns
            const reservedDomains = [
              "localhost", 
              "127.0.0.1", 
              "::1", 
              ".local", 
              ".internal",
              "10.", 
              "172.16.", 
              "192.168.",
              "169.254."
            ];

            const isDev = reservedDomains.some(domain => parsed.hostname.includes(domain));
            if (isDev) {
              return "Please provide a publicly accessible deployment URL";
            }

            // Check domain length and complexity
            if (parsed.hostname.length < 4) {
              return "Domain seems too short. Check your URL.";
            }

            // Verify domain contains a dot (basic domain validation)
            if (!parsed.hostname.includes(".")) {
              return "Invalid domain. Use a fully qualified domain name.";
            }

            return null;
          } catch {
            return "Enter a valid, publicly accessible URL";
          }
        }
      });

      if (!value) return;

      const config = vscode.workspace.getConfiguration("devpulse");
      
      try {
        // Attempt to verify the URL by fetching its frame-src
        const cspResponse = await fetch(`${value}/devpulse-csp-check`, { method: 'GET' })
          .then(response => response.ok)
          .catch(() => false);

        if (!cspResponse) {
          const confirm = await vscode.window.showWarningMessage(
            "Could not verify the app's CSP configuration. Proceed anyway?",
            "Yes", "No"
          );
          if (confirm !== "Yes") return;
        }

        await config.update("webAppUrl", value.trim(), vscode.ConfigurationTarget.Global);
        
        vscode.window.showInformationMessage(
          `DevPulse URL updated to ${value.trim()}. Restart VS Code for full integration.`,
          "Restart Now"
        ).then(choice => {
          if (choice === "Restart Now") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
      } catch (error) {
        vscode.window.showErrorMessage(`URL configuration failed: ${error instanceof Error ? error.message : error}`);
      }
    }),
    vscode.commands.registerCommand("devpulse.sendEditorContext", async () => {
      const editorContext = getEditorContext(state.maxSelectionChars);
      if (!editorContext) {
        vscode.window.showInformationMessage("Open a file first to send context to DevPulse.");
        return;
      }
      await broadcast(targets, { type: "devpulse:editorContext", payload: editorContext });
      vscode.window.showInformationMessage("Sent active editor context to DevPulse.");
    }),
    vscode.commands.registerCommand("devpulse.analyzeSelection", async () => {
      const editorContext = getEditorContext(state.maxSelectionChars);
      if (!editorContext?.selectedText?.trim()) {
        vscode.window.showWarningMessage("Select some code first, then run Analyze Selected Code.");
        return;
      }
      panel.reveal();
      await broadcast(targets, { type: "devpulse:analyzeSelection", payload: editorContext });
      vscode.window.showInformationMessage("Selection sent to DevPulse analysis.");
    }),
    vscode.commands.registerCommand("devpulse.copyContextAsMarkdown", async () => {
      const editorContext = getEditorContext(state.maxSelectionChars);
      if (!editorContext) {
        vscode.window.showInformationMessage("Open a file first to copy editor context.");
        return;
      }
      const markdown = toMarkdownContext(editorContext);
      await vscode.env.clipboard.writeText(markdown);
      vscode.window.showInformationMessage("DevPulse context copied to clipboard.");
    }),
    vscode.commands.registerCommand("devpulse.openWebApp", () => {
      void vscode.env.openExternal(vscode.Uri.parse(state.webAppUrl));
    }),
    vscode.commands.registerCommand("devpulse.refresh", () => {
      vscode.commands.executeCommand("workbench.action.webview.reloadWebviewAction");
      void broadcast(targets, hostReadyPayload());
      void broadcast(targets, themePayload(vscode.window.activeColorTheme.kind));
    }),
    vscode.commands.registerCommand("devpulse.scanWorkspace", async () => {
      const result = await scanner.scan();
      treeDataProvider.updateStats({
        apiUsage: result.apiUsageCount,
        leaks: result.potentialLeaks,
        incidents: 0,
      });
      treeDataProvider.updateInsights(result.insights);
      vscode.window.showInformationMessage(
        `✅ Scan complete! Found ${result.apiUsageCount} APIs and ${result.potentialLeaks} potential issues.`
      );
    }),
    vscode.commands.registerCommand("devpulse.scanDocument", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Open a file first");
        return;
      }
      diagnostics.scanDocument(editor.document);
      vscode.window.showInformationMessage("Document scanned for security issues.");
    }),
    vscode.commands.registerCommand("devpulse.analyzeApi", async (apiUrl: string) => {
      panel.reveal();
      const editorContext = getEditorContext(state.maxSelectionChars);
      await broadcast(targets, {
        type: "devpulse:analyzeSelection",
        payload: { ...editorContext, selectedText: apiUrl },
      });
      vscode.window.showInformationMessage(`Analyzing API: ${apiUrl}`);
    }),
    vscode.commands.registerCommand("devpulse.scanForLeaks", async (fileUri: vscode.Uri, range: vscode.Range) => {
      panel.reveal();
      await broadcast(targets, {
        type: "devpulse:analyzeSelection",
        payload: {
          filePath: fileUri.fsPath,
          selectedText: "potential-api-key-or-secret-detected",
        },
      });
      vscode.window.showWarningMessage(
        "⚠️ Potential API key or secret detected. Review and consider moving to environment variables."
      );
    }),
    vscode.commands.registerCommand("devpulse.showApiRegistry", () => {
      vscode.commands.executeCommand("devpulse.insights.focus");
      panel.reveal();
    }),
    vscode.commands.registerCommand("devpulse.generateReport", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Open a file first");
        return;
      }

      const fileContent = editor.document.getText();
      const apiCount = (fileContent.match(/https?:\/\//g) || []).length;
      const keyCount = (
        fileContent.match(/(?:api[_-]?key|apikey|token|secret)\s*[:=]/gi) || []
      ).length;

      const report = `# DevPulse Security Report\n\n` + `File: ${editor.document.fileName}\n` + `APIs Found: ${apiCount}\n` +
        `Potential Secrets: ${keyCount}\n` +
        `Generated: ${new Date().toISOString()}\n`;

      const reportUri = await vscode.workspace.fs.writeFile(
        vscode.Uri.file(`${editor.document.uri.fsPath}.devpulse-report.md`),
        Buffer.from(report)
      );

      vscode.window.showInformationMessage("📊 Report generated successfully!");
    }),
    vscode.commands.registerCommand("devpulse.scanShadowApis", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showWarningMessage("No workspace folder open");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "DevPulse: Scanning for shadow APIs...",
          cancellable: false,
        },
        async () => {
          const workspaceRoot = workspaceFolders[0].uri.fsPath;
          const result = await shadowApiScanner.scan({ workspaceRoot });

          if (result.shadowRoutes.length === 0) {
            vscode.window.showInformationMessage(
              `No shadow APIs detected. All ${result.totalRoutes} routes are tracked.`
            );
            return;
          }

          // Show shadow APIs in a quick pick for navigation
          const items = result.shadowRoutes.map((route) => {
            const relPath = vscode.workspace.asRelativePath(route.file);
            return {
              label: `${route.method} ${route.path}`,
              description: `${route.framework} — ${relPath}:${route.line}`,
              detail: `Handler: ${route.handler || "unknown"}`,
              route,
            };
          });

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `${result.shadowRoutes.length} shadow API(s) detected — ${result.totalRoutes} total routes, ${result.knownRoutes} tracked`,
            matchOnDescription: true,
            matchOnDetail: true,
          });

          if (selected) {
            const doc = await vscode.workspace.openTextDocument(selected.route.file);
            const editor = await vscode.window.showTextDocument(doc);
            const pos = new vscode.Position(selected.route.line - 1, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          }

          treeDataProvider.updateInsights([
            {
              title: "Shadow APIs Detected",
              description: `Found ${result.shadowRoutes.length} untracked endpoint(s) across ${result.frameworkBreakdown.express + result.frameworkBreakdown.fastapi + result.frameworkBreakdown.django} framework(s)`,
              severity: "warning",
              count: result.shadowRoutes.length,
            },
          ]);
        }
      );
    })
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.name = "DevPulse";
  statusBar.text = "$(pulse) DevPulse";
  statusBar.tooltip = "Open DevPulse panel";
  statusBar.command = "devpulse.openPanel";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      void broadcast(targets, themePayload(theme.kind));
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!state.autoSyncEditorContext) {
        return;
      }
      if (editor) {
        // Scan document for diagnostics
        diagnostics.scanDocument(editor.document);
        const editorContext = getEditorContext(state.maxSelectionChars);
        if (editorContext) {
          void broadcast(targets, { type: "devpulse:editorContext", payload: editorContext });
        }
      }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      // Auto-scan new documents
      diagnostics.scanDocument(document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      // Re-scan on document changes
      diagnostics.scanDocument(event.document);
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (!state.autoSyncEditorContext) {
        return;
      }
      if (event.selections.length === 0) {
        return;
      }
      const editorContext = getEditorContext(state.maxSelectionChars);
      if (editorContext) {
        void broadcast(targets, { type: "devpulse:editorContext", payload: editorContext });
      }
    })
  );

  void broadcast(targets, hostReadyPayload());
}

export function deactivate(): void {}

function getEditorContext(maxSelectionChars: number): EditorContext | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const document = editor.document;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const selection = editor.selection;
  let selectedText = document.getText(selection);
  if (selectedText.length > maxSelectionChars) {
    selectedText = `${selectedText.slice(0, maxSelectionChars)}\n\n/* Selection truncated by DevPulse */`;
  }

  return {
    filePath: document.uri.fsPath,
    languageId: document.languageId,
    relativePath: workspaceFolder ? vscode.workspace.asRelativePath(document.uri, false) : document.fileName,
    workspaceFolder: workspaceFolder?.name,
    selectedText: selectedText || undefined,
    selectionStartLine: selection.start.line + 1,
    selectionEndLine: selection.end.line + 1,
    cursorLine: selection.active.line + 1
  };
}

function toMarkdownContext(context: EditorContext): string {
  const lines = [
    "# DevPulse Editor Context",
    "",
    `- File: ${context.relativePath ?? context.filePath ?? "unknown"}`,
    `- Language: ${context.languageId ?? "unknown"}`,
    `- Workspace: ${context.workspaceFolder ?? "unknown"}`,
    `- Selection: ${context.selectionStartLine ?? "-"}-${context.selectionEndLine ?? "-"}`,
    `- Cursor line: ${context.cursorLine ?? "-"}`,
    ""
  ];

  if (context.selectedText?.trim()) {
    lines.push("```");
    lines.push(context.selectedText);
    lines.push("```");
  } else {
    lines.push("_No selection._");
  }
  return lines.join("\n");
}

function hostReadyPayload(): DevPulseWebviewPayload {
  return {
    type: "devpulse:hostReady",
    payload: {
      workspaceName: vscode.workspace.name
    }
  };
}

function themePayload(kind: vscode.ColorThemeKind): DevPulseWebviewPayload {
  return { type: "devpulse:theme", payload: { kind } };
}

async function broadcast(targets: DevPulseWebviewTarget[], payload: DevPulseWebviewPayload): Promise<void> {
  await Promise.all(targets.map(async (target) => target.postMessage(payload)));
}

function handleWebviewMessage(message: unknown): void {
  if (!message || typeof message !== "object") {
    return;
  }
  const cast = message as { type?: string; payload?: string };
  if (cast.type === "devpulse:runCommand" && typeof cast.payload === "string") {
    void vscode.commands.executeCommand(cast.payload);
    return;
  }
  if (cast.type === "devpulse:openExternal" && typeof cast.payload === "string") {
    void vscode.env.openExternal(vscode.Uri.parse(cast.payload));
  }
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, webAppUrl: string): string {
  const nonce = Math.random().toString(36).slice(2);
  const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "devpulse.svg"));
  const safeUrl = escapeHtmlAttr(webAppUrl);
  let frameSrc = "https: http:";
  try {
    frameSrc = new URL(webAppUrl).origin;
  } catch {
    frameSrc = "https: http:";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; frame-src ${frameSrc}; script-src 'nonce-${nonce}';" />
  <title>DevPulse</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #0b1020; color: #e6e8ef; font-family: var(--vscode-font-family); }
    .root { display: flex; flex-direction: column; height: 100%; }
    .toolbar { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(7,12,24,0.95); align-items: center; }
    .toolbar button { border: 1px solid rgba(255,255,255,0.25); background: transparent; color: inherit; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    .toolbar button:hover { background: rgba(255,255,255,0.08); }
    .badge { margin-left: auto; opacity: .85; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
    .frame-wrap { position: relative; flex: 1; min-height: 0; }
    .frame-wrap iframe { border: 0; width: 100%; height: 100%; background: #0b1020; }
    .fallback {
      position: absolute; inset: 0; display: none; padding: 16px; gap: 12px;
      flex-direction: column; justify-content: center; align-items: flex-start;
      background: linear-gradient(180deg, #0b1020, #101728);
    }
    .fallback.show { display: flex; }
    .fallback a { color: #84ccff; }
  </style>
</head>
<body>
  <div class="root">
    <div class="toolbar">
      <img src="${iconUri}" alt="DevPulse" width="18" height="18" />
      <button id="sendContext">Send Context</button>
      <button id="analyzeSelection">Analyze Selection</button>
      <button id="openExternal">Open in Browser</button>
      <span class="badge" id="status">Connecting...</span>
    </div>
    <div class="frame-wrap">
      <iframe id="frame" src="${safeUrl}" referrerpolicy="no-referrer"></iframe>
      <div id="fallback" class="fallback">
        <h2>Unable to embed DevPulse</h2>
        <p>The target app blocked iframe embedding. Open it in your browser, or allow iframe embedding on your deployment.</p>
        <a href="${safeUrl}" id="fallbackLink">Open DevPulse in browser</a>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const frame = document.getElementById("frame");
    const fallback = document.getElementById("fallback");
    const status = document.getElementById("status");
    let isLoaded = false;

    document.getElementById("sendContext").addEventListener("click", () => vscode.postMessage({ type: "devpulse:runCommand", payload: "devpulse.sendEditorContext" }));
    document.getElementById("analyzeSelection").addEventListener("click", () => vscode.postMessage({ type: "devpulse:runCommand", payload: "devpulse.analyzeSelection" }));
    document.getElementById("openExternal").addEventListener("click", () => vscode.postMessage({ type: "devpulse:openExternal", payload: "${safeUrl}" }));
    document.getElementById("fallbackLink").addEventListener("click", (event) => {
      event.preventDefault();
      vscode.postMessage({ type: "devpulse:openExternal", payload: "${safeUrl}" });
    });

    const failTimer = setTimeout(() => {
      if (!isLoaded) {
        fallback.classList.add("show");
        status.textContent = "Embedding blocked";
      }
    }, 4500);

    frame.addEventListener("load", () => {
      isLoaded = true;
      clearTimeout(failTimer);
      fallback.classList.remove("show");
      status.textContent = "Connected";
    });

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || !msg.type) return;
      status.textContent = msg.type === "devpulse:editorContext" ? "Context synced" : "Connected";
      frame.contentWindow?.postMessage(msg, "*");
    });
  </script>
</body>
</html>`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
