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
- More features may come in the future :)

## Getting started

1. Get the extension from the [Chrome extensions store](https://chrome.google.com/webstore/detail/power-automate-tools/jccblbmcghkddifenlocnjfmeemjeacc) or [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/power-automate-tools/ecdclfoojhebjoknjoooljcakfbfpjoj)
2. Open the flow edit page in the Power Automate portal.
3. Click the extension icon.
4. Edit your flow!

## Change Log

### Unreleased
- Save and Validate always use the latest auth token (they kept the token from when the flow was opened)
- Background state survives the service worker being stopped while idle (`chrome.storage.session`)
- Before saving, the flow is re-read; if it changed since it was opened, you're asked before overwriting
- The server version is backed up before each save (last 10 per flow); restore from the new Backups panel
- The designer tab is reloaded after a save so it can't save an older copy over the change
- Clearer errors: invalid JSON, expired token (HTTP 401) and non-JSON error responses

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
