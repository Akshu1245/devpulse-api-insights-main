# Publishing DevPulse IDE to VS Code Marketplace

This checklist is for the final release step once you are ready to publish.

## 1) Create/verify publisher

1. Sign in to [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage).
2. Create a publisher (or use your existing one).
3. Update `publisher` in `package.json` to match exactly.

## 2) Create a Personal Access Token (PAT)

Create an Azure DevOps PAT with Marketplace publish permission and save it securely.

## 3) Login and publish

From `vscode-extension/`:

```sh
npx @vscode/vsce login <your-publisher-id>
npm run package
npm run publish:vsce
```

## 4) Verify listing

- Open Marketplace listing and verify:
  - extension name, description, and commands
  - README content
  - changelog visibility
  - install flow in stable VS Code

## 5) Version updates

For each new release:

1. Bump `version` in `package.json` (semver).
2. Add release notes in `CHANGELOG.md`.
3. Run:
   ```sh
   npm run build
   npm run package
   npm run publish:vsce
   ```
