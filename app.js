"use strict";

const META_PREFIX = "EXPORT_SELECTED_META::";
const ITEM_PREFIX = "EXPORT_SELECTED_ITEM::";
const FINISH_PREFIX = "EXPORT_SELECTED_FINISH::";
const READY_MESSAGE = "EXPORT_SELECTED_DIRECTORY_READY";
const CANCEL_MESSAGE = "EXPORT_SELECTED_DIRECTORY_CANCELLED";
const REPOSITORY_URL =
  "https://github.com/chaxic/photopea-export-selected-layers";
const PLUGIN_VERSION = "1.0.3";

const DB_NAME = "photopea-export-selected-layers";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const DIRECTORY_KEY = "export-directory";

const state = {
  embedded: window.parent !== window,
  destination: "folder",
  format: "png",
  quality: 90,
  trim: true,
  avoidOverwrite: true,
  folderHandle: null,
  folderName: "",
  folderPermission: "none",
  documentName: "",
  documentSource: "",
  layers: [],
  phase: "idle",
  statusKind: "idle",
  statusText: "",
  exportAfterFolderChoice: false,
  inspectThenExport: false,
  pickerWindow: null,
  exportSession: null,
};

if (!state.embedded) {
  state.layers = [
    { name: "Car Red", type: "layer" },
    { name: "Car Blue", type: "layer" },
    { name: "Sponsor Logos", type: "group" },
  ];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pluginBaseUrl() {
  return new URL("./", document.baseURI).href;
}

function versionedPluginUrl() {
  const url = new URL(pluginBaseUrl());
  url.searchParams.set("v", PLUGIN_VERSION);
  return url.href;
}

function formatExtension(format) {
  return format === "jpg" ? "jpg" : format;
}

function formatSpec() {
  if (state.format === "png") return "png";
  return `${state.format}:${Math.max(1, Math.min(100, state.quality)) / 100}`;
}

function makeInspectScript() {
  return `
(function () {
  var resultTag = ${JSON.stringify(META_PREFIX)};

  function sendResult(result) {
    app.echoToOE(resultTag + JSON.stringify(result));
  }

  try {
    if (!app.documents || app.documents.length === 0) {
      sendResult({ ok: false, message: "Open a document before exporting layers." });
      return;
    }

    var documentRef = app.activeDocument;
    var selected = [];

    function collect(layers, parentPath) {
      for (var index = 0; index < layers.length; index++) {
        var layer = layers[index];
        var path = parentPath.concat([index]);
        var isGroup = layer.layers && layer.layers.length > 0;

        if (layer.selected) {
          selected.push({
            name: String(layer.name),
            path: path,
            type: isGroup ? "group" : "layer"
          });
        }

        if (isGroup) collect(layer.layers, path);
      }
    }

    collect(documentRef.layers, []);

    var source = "";
    try {
      source = String(documentRef.source || "");
    } catch (sourceError) {}

    sendResult({
      ok: true,
      documentName: String(documentRef.name || "Untitled"),
      source: source,
      layers: selected
    });
  } catch (error) {
    sendResult({
      ok: false,
      message: error && error.message ? error.message : String(error)
    });
  }
}());`;
}

function makeExportScript(items) {
  const payload = JSON.stringify({
    items,
    trim: state.trim,
    format: formatSpec(),
  });

  return `
(function () {
  var itemTag = ${JSON.stringify(ITEM_PREFIX)};
  var finishTag = ${JSON.stringify(FINISH_PREFIX)};
  var settings = ${payload};
  var sourceDocument = null;
  var temporaryDocument = null;

  function sendFinish(result) {
    app.echoToOE(finishTag + JSON.stringify(result));
  }

  function isolatePath(layers, path, depth) {
    var targetIndex = path[depth];
    var target = null;

    for (var index = 0; index < layers.length; index++) {
      var layer = layers[index];
      var keep = index === targetIndex;
      layer.visible = keep;
      if (keep) target = layer;
    }

    if (!target) throw new Error("A selected layer could not be found.");

    target.visible = true;
    if (depth < path.length - 1) {
      if (!target.layers) throw new Error("The selected layer path is no longer valid.");
      isolatePath(target.layers, path, depth + 1);
    }
  }

  try {
    if (!app.documents || app.documents.length === 0) {
      sendFinish({ ok: false, message: "Open a document before exporting layers." });
      return;
    }

    sourceDocument = app.activeDocument;
    var exported = 0;

    for (var itemIndex = 0; itemIndex < settings.items.length; itemIndex++) {
      var item = settings.items[itemIndex];
      temporaryDocument = sourceDocument.duplicate();

      isolatePath(temporaryDocument.layers, item.path, 0);

      if (settings.trim) {
        try {
          temporaryDocument.trim(
            TrimType.TRANSPARENT,
            true,
            true,
            true,
            true
          );
        } catch (trimError) {}
      }

      app.echoToOE(itemTag + JSON.stringify({
        index: itemIndex,
        filename: item.filename
      }));
      temporaryDocument.saveToOE(settings.format);
      temporaryDocument.close(SaveOptions.DONOTSAVECHANGES);
      temporaryDocument = null;
      exported++;
      app.activeDocument = sourceDocument;
    }

    sendFinish({ ok: true, exported: exported });
  } catch (error) {
    if (temporaryDocument) {
      try {
        temporaryDocument.close(SaveOptions.DONOTSAVECHANGES);
      } catch (closeError) {}
    }

    if (sourceDocument) {
      try {
        app.activeDocument = sourceDocument;
      } catch (activationError) {}
    }

    sendFinish({
      ok: false,
      message: error && error.message ? error.message : String(error)
    });
  }
}());`;
}

function statusIcon() {
  if (state.statusKind === "working") {
    return '<span class="spinner" aria-hidden="true"></span>';
  }

  let path = "M4.8 6.2h10.4M4.8 10h7.6M4.8 13.8h5.2";
  if (state.statusKind === "ok") path = "m5 10.2 3.1 3.1L15.4 6";
  if (state.statusKind === "error") path = "M10 5.4v5.4M10 14.5v.1";
  if (state.statusKind === "warning") {
    path = "M10 3.8 17 16H3zM10 8v3.4M10 14v.1";
  }

  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${path}"></path></svg>`;
}

function folderIcon() {
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.8 5.5h6l1.6 2h6.8v8H2.8z"></path>
      <path d="M5 12h10"></path>
    </svg>`;
}

function zipIcon() {
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 2.8h7l3 3v11.4H5z"></path>
      <path d="M12 2.8v3h3M8.5 5h2M8.5 8h2M8.5 11h2M8.5 14h2"></path>
    </svg>`;
}

function destinationHtml() {
  if (state.destination === "zip") {
    return `
      <p class="section-label">Destination</p>
      <div class="destination-card">
        <div class="destination-icon">${zipIcon()}</div>
        <div class="destination-copy">
          <strong>ZIP download</strong>
          <span>One archive containing every exported layer</span>
        </div>
      </div>`;
  }

  const title = state.folderName || "Workfile folder not selected";
  let subtitle = "Choose the folder containing your workfile";
  if (state.folderPermission === "granted") {
    subtitle = "Remembered by this browser";
  } else if (state.folderName) {
    subtitle = "Access will be restored in a secure folder window";
  }

  return `
    <p class="section-label">Destination</p>
    <div class="destination-card">
      <div class="destination-icon">${folderIcon()}</div>
      <div class="destination-copy">
        <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <button class="small-button" id="choose-folder" type="button">
        ${state.folderName ? "Change" : "Choose"}
      </button>
    </div>`;
}

function settingsHtml() {
  const showQuality = state.format !== "png";

  return `
    <div class="settings-block">
      <p class="section-label">Export settings</p>
      <div class="field-grid">
        <label>
          <span>Format</span>
          <select id="format">
            <option value="png" ${state.format === "png" ? "selected" : ""}>PNG</option>
            <option value="jpg" ${state.format === "jpg" ? "selected" : ""}>JPG</option>
            <option value="webp" ${state.format === "webp" ? "selected" : ""}>WEBP</option>
          </select>
        </label>
        <label>
          <span>Quality</span>
          <input
            id="quality"
            type="number"
            min="1"
            max="100"
            value="${state.quality}"
            ${showQuality ? "" : "disabled"}
          />
        </label>
      </div>
      <div class="option-list">
        <label class="check-label">
          <input id="trim" type="checkbox" ${state.trim ? "checked" : ""} />
          <span>Trim transparent pixels around each exported layer</span>
        </label>
        ${
          state.destination === "folder"
            ? `<label class="check-label">
                <input id="avoid-overwrite" type="checkbox" ${state.avoidOverwrite ? "checked" : ""} />
                <span>Avoid replacing existing files by adding a number</span>
              </label>`
            : ""
        }
      </div>
    </div>`;
}

function selectionHtml() {
  if (!state.layers.length) return "";

  const shown = state.layers.slice(0, 6);
  return `
    <div class="selection-list" aria-label="Selected layers">
      <div class="selection-title">
        <span>Selected for export</span>
        <span>${state.layers.length}</span>
      </div>
      ${shown
        .map(
          (layer) => `
            <div class="selection-item">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                ${
                  layer.type === "group"
                    ? '<path d="M1.8 4h5l1.3 1.7h6v7.1H1.8z"></path>'
                    : '<path d="M2.2 3h8l3.6 3.6V13H2.2zM10.2 3v3.7h3.6"></path>'
                }
              </svg>
              <span title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</span>
              <em>${layer.type}</em>
            </div>`,
        )
        .join("")}
      ${
        state.layers.length > shown.length
          ? `<div class="selection-more">+${state.layers.length - shown.length} more selected</div>`
          : ""
      }
    </div>`;
}

function panelHtml() {
  const busy = state.phase !== "idle";

  return `
    <section class="plugin-panel" aria-label="Export Selected Layers plugin">
      <header class="panel-header">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M3.5 6.5h7l2 2h8v11h-17z"></path>
            <path d="M12 10.5v6m0 0-2.5-2.5M12 16.5l2.5-2.5"></path>
          </svg>
        </div>
        <div>
          <h1>Export Selected Layers</h1>
          <p>Save each selected layer as its own file</p>
        </div>
      </header>

      <div class="destination-tabs" role="tablist" aria-label="Export destination">
        <button
          class="${state.destination === "folder" ? "active" : ""}"
          data-destination="folder"
          role="tab"
          aria-selected="${state.destination === "folder"}"
        >
          Direct folder
        </button>
        <button
          class="${state.destination === "zip" ? "active" : ""}"
          data-destination="zip"
          role="tab"
          aria-selected="${state.destination === "zip"}"
        >
          ZIP download
        </button>
      </div>

      <div class="panel-body">
        ${destinationHtml()}
        ${settingsHtml()}
        ${selectionHtml()}

        <div class="panel-actions">
          <div class="status status-${state.statusKind}" role="status" aria-live="polite">
            ${statusIcon()}
            <span>${escapeHtml(state.statusText)}</span>
          </div>
          <div class="action-row">
            <button class="secondary" id="refresh-selection" type="button" ${busy ? "disabled" : ""}>
              Refresh
            </button>
            <button class="primary" id="export-selected" type="button" ${busy ? "disabled" : ""}>
              Export selected
            </button>
          </div>
        </div>
      </div>

      <footer class="panel-footer">
        <span>Local processing · Workfile remains unchanged</span>
        <a
          href="${REPOSITORY_URL}"
          target="_blank"
          rel="noreferrer"
          title="View the Export Selected Layers source code on GitHub"
        >
          View source <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </section>`;
}

function installerHtml() {
  const hostname = new URL(pluginBaseUrl()).host;

  return `
    <div class="install-layout">
      <section class="install-copy">
        <div class="eyebrow"><span class="eyebrow-dot"></span>Photopea plugin</div>
        <h1>Export selected layers in one click.</h1>
        <p class="intro">
          Turn selected layers and groups into individual PNG, JPG, or WEBP
          files—without hiding layers one by one.
        </p>
        <div class="feature-pills">
          <span>Direct folder</span>
          <span>PNG · JPG · WEBP</span>
          <span>Trim bounds</span>
          <span>ZIP fallback</span>
        </div>
        <div class="install-actions">
          <button class="download-button" id="download-plugin" type="button">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 3.5v8m0 0 3-3m-3 3-3-3M4 14.5v2h12v-2"></path>
            </svg>
            Download plugin
          </button>
          <a href="https://www.photopea.com" target="_blank" rel="noreferrer">
            Open Photopea <span aria-hidden="true">↗</span>
          </a>
          <a href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">
            View source <span aria-hidden="true">↗</span>
          </a>
        </div>
        <ol class="steps">
          <li>
            <span>1</span>
            <div>
              <strong>Download the installer</strong>
              <p>Save the small Export Selected Layers JSON file.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Open Window → Plugins</strong>
              <p>Choose Add Plugin at the top of Photopea’s plugin window.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Select layers and export</strong>
              <p>Choose the workfile folder once, or download a ZIP.</p>
            </div>
          </li>
        </ol>
        <p class="privacy-note">
          Runs locally in Photopea. No document, image, or layer data is uploaded.
        </p>
      </section>
      <section class="preview-wrap" aria-label="Plugin preview">
        <div class="preview-label">
          <span>Plugin preview</span>
          <span>${escapeHtml(hostname)}</span>
        </div>
        ${panelHtml()}
      </section>
    </div>`;
}

function render() {
  const root = document.querySelector("#app");
  if (!root) return;

  root.className = state.embedded ? "embedded-shell" : "install-page";
  root.innerHTML = state.embedded ? panelHtml() : installerHtml();
  bindEvents();
}

function updateSettingsFromInputs() {
  const format = document.querySelector("#format");
  const quality = document.querySelector("#quality");
  const trim = document.querySelector("#trim");
  const avoidOverwrite = document.querySelector("#avoid-overwrite");

  if (format) state.format = format.value;
  if (quality) {
    state.quality = Math.max(
      1,
      Math.min(100, Number(quality.value) || state.quality),
    );
  }
  if (trim) state.trim = trim.checked;
  if (avoidOverwrite) state.avoidOverwrite = avoidOverwrite.checked;
}

function setStatus(kind, text, phase = "idle") {
  state.statusKind = kind;
  state.statusText = text;
  state.phase = phase;
  render();
}

function inspectSelection(thenExport = false) {
  if (!state.embedded) {
    setStatus("idle", "Install the plugin to use it inside Photopea.");
    return;
  }

  updateSettingsFromInputs();
  state.inspectThenExport = thenExport;
  state.phase = "inspect";
  state.statusKind = "working";
  state.statusText = thenExport
    ? "Checking the selected layers…"
    : "Reading the current selection…";
  render();
  window.parent.postMessage(makeInspectScript(), "*");
}

function sanitizeBaseName(value) {
  let output = String(value || "Layer")
    .replace(/\.(png|jpe?g|webp)$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!output) output = "Layer";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(output)) {
    output = `_${output}`;
  }
  return output.slice(0, 180);
}

function prepareExportItems() {
  const extension = formatExtension(state.format);
  const used = new Set();

  return state.layers.map((layer) => {
    const base = sanitizeBaseName(layer.name);
    let candidate = base;
    let suffix = 2;

    while (used.has(candidate.toLocaleLowerCase())) {
      candidate = `${base}-${suffix}`;
      suffix++;
    }

    used.add(candidate.toLocaleLowerCase());
    return {
      path: layer.path,
      filename: `${candidate}.${extension}`,
    };
  });
}

function beginExport() {
  if (!state.embedded) {
    setStatus("idle", "Install the plugin to use it inside Photopea.");
    return;
  }

  updateSettingsFromInputs();

  if (state.destination === "folder") {
    if (!state.folderHandle) {
      state.exportAfterFolderChoice = true;
      openFolderPicker("choose");
      return;
    }

    if (state.folderPermission !== "granted") {
      state.exportAfterFolderChoice = true;
      openFolderPicker("restore");
      return;
    }
  }

  inspectSelection(true);
}

function runExport() {
  if (!state.layers.length) {
    setStatus("error", "Select one or more layers or groups first.");
    return;
  }

  const items = prepareExportItems();
  state.exportSession = {
    expected: items.length,
    received: 0,
    metadataQueue: [],
    zipEntries: [],
    writes: [],
    filenames: [],
    scriptFinished: false,
    scriptResult: null,
    finalizing: false,
  };
  state.phase = "export";
  state.statusKind = "working";
  state.statusText = `Exporting 0 of ${items.length} selected layer(s)…`;
  render();
  window.parent.postMessage(makeExportScript(items), "*");
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeDirectoryHandle(handle) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, DIRECTORY_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

async function loadStoredDirectoryHandle() {
  try {
    const database = await openDatabase();
    const handle = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(DIRECTORY_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();

    state.folderHandle = handle;
    state.folderName = handle?.name || "";
    state.folderPermission = "none";

    if (handle?.queryPermission) {
      state.folderPermission = await handle.queryPermission({ mode: "readwrite" });
    }
  } catch {
    state.folderHandle = null;
    state.folderName = "";
    state.folderPermission = "none";
  }

  render();
}

function openFolderPicker(mode = "restore") {
  if (!state.embedded) {
    setStatus("idle", "Install the plugin to choose an export folder.");
    return;
  }

  const pickerUrl = new URL("picker.html", pluginBaseUrl());
  pickerUrl.searchParams.set("from", "photopea");
  pickerUrl.searchParams.set("mode", mode);
  state.pickerWindow = window.open(
    pickerUrl.href,
    "photopea-export-folder",
    "popup=yes,width=500,height=560",
  );

  if (!state.pickerWindow) {
    state.exportAfterFolderChoice = false;
    setStatus(
      "error",
      "The folder window was blocked. Allow pop-ups for this plugin and try again.",
    );
    return;
  }

  setStatus(
    "warning",
    mode === "restore"
      ? "Restore folder access in the secure window to continue exporting."
      : "Choose the folder containing your workfile in the new window.",
  );
}

async function findAvailableFile(directoryHandle, filename) {
  if (!state.avoidOverwrite) {
    return {
      filename,
      handle: await directoryHandle.getFileHandle(filename, { create: true }),
    };
  }

  const dotIndex = filename.lastIndexOf(".");
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : "";
  let candidate = filename;
  let suffix = 2;

  while (true) {
    try {
      await directoryHandle.getFileHandle(candidate);
      candidate = `${base}-${suffix}${extension}`;
      suffix++;
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
      return {
        filename: candidate,
        handle: await directoryHandle.getFileHandle(candidate, {
          create: true,
        }),
      };
    }
  }
}

async function writeFileToDirectory(filename, buffer) {
  const target = await findAvailableFile(state.folderHandle, filename);
  const writable = await target.handle.createWritable();
  await writable.write(buffer);
  await writable.close();
  return target.filename;
}

function handleExportBuffer(buffer) {
  const session = state.exportSession;
  if (!session || state.phase !== "export") return;

  const metadata = session.metadataQueue.shift();
  if (!metadata) {
    session.writes.push(
      Promise.reject(new Error("Photopea returned a file without its layer name.")),
    );
    return;
  }

  session.received++;

  if (state.destination === "folder") {
    const write = writeFileToDirectory(metadata.filename, buffer).then(
      (filename) => {
        session.filenames.push(filename);
        return filename;
      },
    );
    session.writes.push(write);
  } else {
    session.zipEntries.push({
      name: metadata.filename,
      data: new Uint8Array(buffer),
    });
    session.filenames.push(metadata.filename);
  }

  state.statusText = `Exporting ${session.received} of ${session.expected} selected layer(s)…`;
  const statusText = document.querySelector(".status span");
  if (statusText) statusText.textContent = state.statusText;
  maybeFinalizeExport();
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const stamp = dosDateTime();
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);

    localParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, nameBytes);

    localOffset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, centralDirectory, end], {
    type: "application/zip",
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function documentBaseName() {
  return sanitizeBaseName(
    (state.documentName || "photopea")
      .replace(/\.(psd|psb|xcf|sketch|fig|ai|pdf)$/i, "")
      .trim(),
  );
}

async function maybeFinalizeExport() {
  const session = state.exportSession;
  if (
    !session ||
    session.finalizing ||
    !session.scriptFinished ||
    session.received < session.expected
  ) {
    return;
  }

  session.finalizing = true;

  if (!session.scriptResult?.ok) {
    setStatus(
      "error",
      session.scriptResult?.message || "Photopea could not export the layers.",
    );
    return;
  }

  try {
    const results = await Promise.allSettled(session.writes);
    const failed = results.filter((result) => result.status === "rejected");

    if (failed.length) {
      throw failed[0].reason;
    }

    if (state.destination === "zip") {
      const zip = createStoredZip(session.zipEntries);
      downloadBlob(zip, `${documentBaseName()}-layers.zip`);
      setStatus(
        "ok",
        `Downloaded ${session.received} exported layer(s) in one ZIP file.`,
      );
    } else {
      setStatus(
        "ok",
        `Exported ${session.received} layer(s) directly to “${state.folderName}”.`,
      );
    }
  } catch (error) {
    setStatus(
      "error",
      error?.message || "One or more exported files could not be saved.",
    );
  }
}

function downloadInstaller() {
  const base = pluginBaseUrl();
  const manifest = {
    name: "Export Selected Layers",
    url: versionedPluginUrl(),
    icon: `===${new URL("icon.svg", base).href}`,
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, "export-selected-layers-photopea.json");
}

function bindEvents() {
  document.querySelectorAll("[data-destination]").forEach((button) => {
    button.addEventListener("click", () => {
      updateSettingsFromInputs();
      state.destination = button.dataset.destination;
      state.statusKind = "idle";
      state.statusText =
        state.destination === "folder"
          ? "Choose the workfile folder once, then export directly."
          : "Selected layers will be combined into one ZIP download.";
      render();
    });
  });

  document
    .querySelector("#choose-folder")
    ?.addEventListener("click", () => {
      state.exportAfterFolderChoice = false;
      openFolderPicker("change");
    });

  document
    .querySelector("#refresh-selection")
    ?.addEventListener("click", () => inspectSelection(false));

  document
    .querySelector("#export-selected")
    ?.addEventListener("click", beginExport);

  document
    .querySelector("#download-plugin")
    ?.addEventListener("click", downloadInstaller);

  document.querySelector("#format")?.addEventListener("change", () => {
    updateSettingsFromInputs();
    render();
  });

  document.querySelectorAll("#quality, #trim, #avoid-overwrite").forEach((input) => {
    input.addEventListener("change", updateSettingsFromInputs);
  });
}

window.addEventListener("message", async (event) => {
  if (event.origin === window.location.origin && event.data?.type) {
    if (event.data.type === READY_MESSAGE) {
      if (event.data.handle) {
        state.folderHandle = event.data.handle;
        state.folderName = event.data.handle.name || event.data.name || "";
        try {
          await storeDirectoryHandle(event.data.handle);
        } catch {}
      } else {
        await loadStoredDirectoryHandle();
      }
      state.folderPermission = "granted";
      state.statusKind = "ok";
      state.statusText = `Using “${state.folderName}” for direct exports.`;
      state.phase = "idle";
      render();

      if (state.exportAfterFolderChoice) {
        state.exportAfterFolderChoice = false;
        inspectSelection(true);
      }
      return;
    }

    if (event.data.type === CANCEL_MESSAGE) {
      state.exportAfterFolderChoice = false;
      setStatus(
        "warning",
        "No folder was selected. Choose a folder or use ZIP download.",
      );
      return;
    }
  }

  if (
    !state.embedded ||
    event.source !== window.parent
  ) {
    return;
  }

  if (event.data instanceof ArrayBuffer) {
    handleExportBuffer(event.data);
    return;
  }

  if (typeof event.data !== "string") return;

  if (event.data.startsWith(META_PREFIX)) {
    try {
      const result = JSON.parse(event.data.slice(META_PREFIX.length));
      if (!result.ok) {
        state.inspectThenExport = false;
        setStatus(
          "error",
          result.message || "Photopea could not read the selected layers.",
        );
        return;
      }

      state.documentName = result.documentName || "Untitled";
      state.documentSource = result.source || "";
      state.layers = result.layers || [];
      const shouldExport = state.inspectThenExport;
      state.inspectThenExport = false;

      if (!state.layers.length) {
        setStatus("error", "Select one or more layers or groups first.");
        return;
      }

      if (shouldExport) {
        runExport();
      } else {
        setStatus(
          "ok",
          `${state.layers.length} selected layer(s) ready to export.`,
        );
      }
    } catch {
      setStatus("error", "Photopea returned unreadable layer information.");
    }
    return;
  }

  if (event.data.startsWith(ITEM_PREFIX)) {
    try {
      const metadata = JSON.parse(event.data.slice(ITEM_PREFIX.length));
      state.exportSession?.metadataQueue.push(metadata);
    } catch {
      setStatus("error", "Photopea returned an unreadable export name.");
    }
    return;
  }

  if (event.data.startsWith(FINISH_PREFIX)) {
    try {
      const result = JSON.parse(event.data.slice(FINISH_PREFIX.length));
      if (!state.exportSession) return;
      state.exportSession.scriptFinished = true;
      state.exportSession.scriptResult = result;
      maybeFinalizeExport();
    } catch {
      setStatus("error", "Photopea returned an unreadable export result.");
    }
  }
});

state.statusText = state.embedded
  ? "Select layers, then refresh or export."
  : "Interactive plugin preview.";
render();

if (state.embedded) {
  loadStoredDirectoryHandle();
  setTimeout(() => inspectSelection(false), 180);
}
