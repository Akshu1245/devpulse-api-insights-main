import * as vscode from "vscode";
import { DevPulseClient } from "../services/devPulseClient";

export class CodelensProvider implements vscode.CodeLensProvider {
  onDidChangeCodeLenses?: vscode.Event<void>;
  
  constructor(private devPulseClient: DevPulseClient) {}

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    return [];
  }
}
