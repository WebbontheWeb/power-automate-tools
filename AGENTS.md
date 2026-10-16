# AGENTS.md

## Project Overview

Power Automate Tools is a Chrome/Edge browser extension (Manifest V3) that lets users edit Microsoft Power Automate flow definitions as raw JSON using an embedded Monaco Editor. It piggybacks on the user's existing Power Automate session by intercepting API requests to extract auth tokens, then uses those tokens for its own API calls to fetch, save, and validate flows.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **UI:** React 18, Fluent UI React (`@fluentui/react`)
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **Bundler:** Webpack 5 (two entry points: `background.ts` and `app.tsx`)
- **Platform:** Chrome Extension Manifest V3
- **Package Manager:** npm
- **License:** GPL v3

## Project Structure

```
src/
  app.tsx                          # React SPA entry point (editor tab)
  background.ts                    # Chrome extension background service worker
  styles/theme.ts                  # Fluent UI theme definition
  schemas/                         # JSON schemas for Monaco validation
    flow-editor.json               # Custom wrapper schema
    workflowdefinition.json        # Official Microsoft Logic Apps schema
  features/flow-editor/            # Feature module for the editor
    FlowEditorPage.tsx             # Main editor page component
    FlowValidationResult.tsx       # Validation results panel
    FlowBackupsPanel.tsx           # Backups panel (restore, delete, turn off)
    useFlowEditor.ts               # Core business logic hook (fetch/save/validate)
    flowBackups.ts                 # Pre-save backups in chrome.storage.local
    useFileSync.ts                 # Hook linking the editor to a local .json file
    fileSync.ts                    # File change detection and merge rules (no browser APIs; testable with mocks)
    fileLinks.ts                   # File pickers, permissions, file handles in IndexedDB
    types.ts                       # FlowError type
  common/
    components/                    # Shared UI components (Messages, LoaderModal, NavBar)
    providers/ApiProvider.ts       # React Context providing authenticated HTTP methods
    types/backgroundActions.ts     # Discriminated union types for Chrome messaging
public/                            # Static assets copied to dist/ (manifest.json, icons, app.html)
scripts/pack-extension.ps1         # PowerShell script to pack .crx
```

## Architecture

1. **Background service worker** (`background.ts`) intercepts web requests to `*.api.flow.microsoft.com/*`, extracts Bearer tokens from the Authorization header, and manages extension state (auth token, API URL, tab IDs). It opens the editor in a new tab when the extension icon is clicked.

   Its state is mirrored into `chrome.storage.session` so it survives the service worker being stopped while idle.

2. **React SPA** (`app.tsx`) runs in a separate tab with Monaco Editor. It receives auth tokens from the background worker via `chrome.runtime.onMessage`, and also pulls the latest one (`get-token`) before every request, keeping it in a ref inside `ApiProviderContext`. Flow/environment IDs are passed via URL query parameters.

   The editor page's message listener only answers the background worker (never other editor tabs), and the background only answers the editor tab it opened.

   Saving re-reads the flow and asks before overwriting changes made elsewhere, and backs up the server version to `chrome.storage.local` (`flowBackups.ts`: compact JSON, 14-day retention, last 10 per flow, ~4 MB total cap, can be turned off). After a save the user can ask the background to reload the designer tab (`refresh`), which it does only if that tab still shows the flow.

   **Local file sync** (`useFileSync.ts`, `fileSync.ts`, `fileLinks.ts`): "Link to file" writes the editor JSON to a file picked with `showSaveFilePicker`, or links one picked with `showOpenFilePicker`. While linked, the file is watched (`FileSystemObserver` plus a 5 s poll where available, otherwise a 1.5 s poll of `getFile().lastModified`; no checks while the tab is hidden). A change is loaded into the editor as one undoable edit (`pushEditOperations` over the full range), never saved. If the editor has edits that are neither in the file (last sync) nor on the server (baseline), the user is asked first. Invalid JSON (for example a half-written file) isn't loaded. Save pauses the watcher, and after a successful save writes the saved version back, unless the file changed meanwhile. The file handle (never content) is kept per flow in IndexedDB (`power-automate-tools` / `fileLinks`) so it relinks on reopen; when permission has lapsed, a Reconnect button re-requests it (needs a click). Only editor JSON is ever written to disk, and saving to Power Automate only happens through Save.

3. **API calls** go through `ApiProvider.ts`, which appends `?api-version=2016-11-01` and the auth header to all requests.

4. **JSON Schema validation** is handled by Monaco Editor using the bundled Microsoft Logic Apps workflow definition schema.

## Code Conventions

- **No default exports** -- all components and hooks use named exports.
- **Functional components only** -- no class components.
- **Custom hooks pattern** -- business logic lives in hooks (`useFlowEditor`, `useMessageBar`), components are thin rendering layers.
- **Fluent UI deep imports** -- import from specific sub-paths (e.g., `@fluentui/react/lib/CommandBar`) for tree-shaking.
- **CSS-in-JS** -- use `mergeStyles()` from Fluent UI. No CSS files or CSS modules.
- **TypeScript strict mode** -- `"strict": true` in tsconfig.json.
- **Feature-based folder structure** -- feature code under `src/features/`, shared code under `src/common/`.
- **Discriminated unions for messaging** -- Chrome message types use a TypeScript discriminated union (`Actions` type in `backgroundActions.ts`).

## Build & Development

| Command | Description |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Development mode with Webpack watch + progress |
| `npm run build` | Production build (cleans `dist/`, builds with `NODE_ENV=production`) |
| `npm run clean` | Remove `dist/` directory |

To develop locally: run `npm start`, then load the `dist/` directory as an unpacked extension in Chrome/Edge.

## CI

GitHub Actions (`.github/workflows/build.yml`) runs on push/PR to `master`:
- Node.js 16.x on `ubuntu-latest`
- `npm ci` then `npm run build`
- Uploads `dist/` as a build artifact

## Testing

There are no tests or test framework in this project. There is no test script in `package.json`.

`fileSync.ts` takes its file handle, timers, observer and editor access as parameters, so it can be tested in Node with mocks: compile it alone (`npx tsc src/features/flow-editor/fileSync.ts --outDir <temp> --target es2019 --module commonjs`) and drive `createFileSync` with a fake handle whose `getFile`/`createWritable` read and write a string.

## Key Details for AI Agents

- The extension does **not** implement its own OAuth flow. It intercepts tokens from the user's existing Power Automate session via the `chrome.webRequest` API.
- The Power Automate API version `2016-11-01` is hardcoded in `ApiProvider.ts`.
- The background worker handles multiple Power Automate URL formats (flow.microsoft.com, make.powerautomate.com, make.powerapps.com).
- The `workflowdefinition.json` schema is ~2460 lines and is the official Microsoft schema -- do not modify it unless updating from the upstream source.
- Local file sync uses the File System Access API from the editor page; no manifest permission is involved. Don't add anything to the synced file besides the editor JSON (no tokens, IDs or metadata).
- The `public/manifest.json` defines extension permissions, content security policy, and host permissions for `*.flow.microsoft.com`.
