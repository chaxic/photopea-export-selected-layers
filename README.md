# Export Selected Layers for Photopea

A lightweight Photopea sidebar plugin for exporting selected layers as
individual image files.

## Features

- Export only the currently selected layers and groups
- PNG, JPG, and WEBP output
- Optional transparent-pixel trimming
- Direct export to a chosen local folder in Chromium-based browsers
- Remembers the chosen folder, subject to browser permission
- ZIP download fallback for browsers without direct folder access
- Safe file-name cleanup and duplicate-name handling
- No server, account, database, or document upload

## Install

1. Open the
   [installer page](https://chaxic.github.io/photopea-export-selected-layers/).
2. Download `export-selected-layers-photopea.json`.
3. In Photopea, open **Window → Plugins → Add Plugin**.
4. Select the downloaded JSON file.

## Destination behavior

Web browsers do not expose a local workfile's full path to Photopea plugins.
On the first direct export, choose the folder containing the workfile. The
plugin stores the directory handle locally and reuses it when permission is
still available. If the browser does not support direct folder access, choose
the ZIP destination instead.

## Development

Serve this folder through any static HTTP server. The full installer appears in
a normal browser tab. When loaded by Photopea as an iframe, it automatically
shows the responsive plugin panel.

Run the included smoke checks with:

```bash
npm test
```

The plugin uses Photopea's Live Messaging API. It duplicates the active
document temporarily, isolates one selected layer or group, and calls
`saveToOE()` once. After Photopea returns the documented `ArrayBuffer` and
`done` messages, the plugin closes the temporary document and advances to the
next layer. Photopea's `Document.duplicate()` activates the duplicate but does
not return it, so the plugin reads the new temporary document from
`app.activeDocument`. Each duplicate receives a unique private document name,
allowing cleanup to close that exact copy even if Photopea changes the active
document during export. The workfile remains open and unchanged.
