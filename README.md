![Extension Logo](public/icons/pa-tools-128.png)

# Power Automate Tools Extension

![Extension Screen Shot](static/pa-tools-extension.jpg)

The Chrome/Edge extension enables editing a Power Automate flow definition as JSON.

## Motivation

The reason behind creating this extension is constantly struggling with repetitive tasks in the flow authoring workflow like replacing a SharePoint site's URL or changing the variable name.

## Features

- Edit a Power Automate flow as JSON in your browser.
- Workflow definition JSON schema validation.
- Rich text manipulation features thanks to [Monaco Editor (VS Code)](https://microsoft.github.io/monaco-editor/).
- Validating actions using "Flow Checker".
- Sync the editor with a local `.json` file, so AI coding tools or any text editor can work on the flow while the extension does the saving.
- More features may come in the future :)

## Getting started

1. Get the extension from the [Chrome extensions store](https://chrome.google.com/webstore/detail/power-automate-tools/jccblbmcghkddifenlocnjfmeemjeacc) or [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/power-automate-tools/ecdclfoojhebjoknjoooljcakfbfpjoj)
2. Open the flow edit page in the Power Automate portal.
3. Click the extension icon.
4. Edit your flow!

## Editing a flow with AI tools (local file sync)

Claude Code, GitHub Copilot, Cursor and other tools work on files, so the editor can keep a local file in sync with the flow:

1. Open the flow in the editor and click **Link to file**, then **Save to a new file...** (or **Link an existing file...**). The flow's JSON is written to the file.
2. Open the file (or its folder) in your tool and ask for changes, for example "rename the variable `x` to `customerId` in every action" or "add a Scope with error handling around the HTTP actions".
3. When the file changes, the editor loads it as a single edit. Review it there; Ctrl+Z undoes it. If you also edited in the editor, you're asked before your edits are replaced. A file that isn't valid JSON (yet) isn't loaded.
4. Click **Save**. Saving still re-reads the flow, asks before overwriting changes made elsewhere and makes a backup. The saved version (as Power Automate returns it) is then written back to the file, so your tool sees the result.

Notes:
- Nothing is saved to Power Automate until you click Save in the editor.
- Only the editor's JSON is written to the file, never tokens. The file contains the flow definition, including anything typed into actions (keys, passwords), so keep it out of shared folders and source control unless that's intended.
- The link is remembered per flow. When the editor is reopened, the browser may ask again for permission; click **Reconnect** in the message bar.
- The file is checked about every 1.5 seconds (instantly where the browser supports file observers), and only while the editor tab is visible; switching back to the tab checks right away.
- **Unlink** stops syncing; the file is left as it is.
- Needs the File System Access API (Chrome and Edge 86+). The command is hidden where it isn't available.

## Change Log

### Unreleased
- Save and Validate always use the latest auth token (they kept the token from when the flow was opened)
- Background state survives the service worker being stopped while idle (`chrome.storage.session`)
- Before saving, the flow is re-read; if it changed since it was opened, you're asked before overwriting. A rename made elsewhere is kept.
- The server version is backed up before each save; restore from the new Backups panel. Backups are kept 14 days (last 10 per flow, about 4 MB in total), can be deleted or turned off, and the panel warns that they include any secrets typed into actions.
- After a save, a "Reload designer" button reloads the designer tab (only if it still shows that flow) so it can't save an older copy over the change
- Clearer errors: invalid JSON, expired token (HTTP 401) and non-JSON error responses
- Local file sync: link the editor to a `.json` file so AI coding tools or text editors can edit the flow; file changes load into the editor for review, and Save writes the saved version back to the file
- Hardening: only the extension's editor tab can request tokens, flow and environment IDs are validated before use, and Monaco no longer fetches `$schema` URLs pasted into the editor

### v1.3
- Migrated to the new Power Platform API (`*.api.powerplatform.com`)
- Fixed flow detection for solution flows and multiple environments
- Per-tab state tracking for auth tokens and API URLs

### v1.2
- Fixed the issue of saving a flow
- Support for launching from the new Power Automate designer
- Improved launching from the Power Apps Portal
- Now the editor allows to edit the flow definition and connection references

### v1.1

Added support for opening a flow from the new Power Automate portal and Power Apps portal.
## Known limitations

- The extension can only use tokens the Power Automate page has requested. If the token expires while the designer tab sits idle, reload that tab and save again; your edits in the editor are kept.
