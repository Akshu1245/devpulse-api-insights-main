# DevPulse IDE

Use DevPulse directly inside VS Code without leaving your editor.

## Features

- Sidebar view in the activity bar (`DevPulse`)
- Full panel view for larger workflows
- Send active file context to DevPulse
- Analyze selected code from the command palette or `Ctrl+Alt+D`
- Copy editor context as Markdown for quick sharing
- Status bar launcher for one-click access

## Commands

- `DevPulse: Open Full Panel`
- `DevPulse: Send Active Editor Context`
- `DevPulse: Analyze Selected Code`
- `DevPulse: Copy Context as Markdown`
- `DevPulse: Open Web App`
- `DevPulse: Configure Web App URL`
- `DevPulse: Refresh`

## Setup

1. Open this `vscode-extension` folder in VS Code.
2. Run:
   ```sh
   npm install
   npm run build
   ```
3. Press `F5` to launch Extension Development Host.

## Configuration

- `devpulse.webAppUrl` (default: `http://localhost:8080`)
- `devpulse.autoSyncEditorContext` (default: `true`)
- `devpulse.maxSelectionChars` (default: `12000`)

## Notes

- For local development, run your DevPulse web app on `http://localhost:8080` (or update `devpulse.webAppUrl`).
- If your deployed app blocks iframes (`X-Frame-Options` / strict `frame-ancestors`), use **Open in Browser**.

## Marketplace publishing

See `PUBLISHING.md` for full release/publish steps.
