"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  new URL("../app.js", `file://${__filename}`).pathname,
  "utf8",
);
const root = { className: "", innerHTML: "" };
const fakeDocument = {
  baseURI: "https://example.com/photopea-export-selected-layers/",
  querySelector(selector) {
    return selector === "#app" ? root : null;
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return { click() {} };
  },
};
const fakeWindow = {
  location: { origin: "https://example.com" },
  parent: null,
  addEventListener() {},
  postedMessages: [],
  postMessage(message) {
    this.postedMessages.push(message);
  },
  open() {
    return {};
  },
};
fakeWindow.parent = fakeWindow;

const context = {
  window: fakeWindow,
  document: fakeDocument,
  URL,
  Blob,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  DataView,
  Set,
  Promise,
  console,
  setTimeout() {},
  clearTimeout() {},
  indexedDB: {},
};

vm.createContext(context);
vm.runInContext(
  `${source}
globalThis.__test = {
  sanitizeBaseName,
  createStoredZip,
  makeInspectScript,
  makeExportItemScript,
  makeCleanupScript,
  versionedPluginUrl,
  asArrayBuffer,
  handleExportBuffer,
  handlePhotopeaDone,
  handleCleanupResult,
  maybeCompleteCleanup,
  state
};`,
  context,
);

const helpers = context.__test;

assert.equal(helpers.sanitizeBaseName("Car:Red.png"), "Car_Red");
assert.equal(helpers.sanitizeBaseName("CON"), "_CON");
assert.equal(helpers.sanitizeBaseName("  Tree   Oak  "), "Tree Oak");
assert.match(root.innerHTML, /Export Selected Layers/);
assert.match(root.innerHTML, /v1\.0\.9/);
assert.doesNotMatch(
  source,
  /state\.folderHandle\.requestPermission|handle\.requestPermission/,
);
assert.match(source, /openFolderPicker\("restore"\)/);
assert.equal(
  helpers.versionedPluginUrl(),
  "https://example.com/photopea-export-selected-layers/?v=1.0.9",
);

const inspectScript = helpers.makeInspectScript(17);
assert.doesNotThrow(() => new vm.Script(inspectScript));
assert.match(inspectScript, /var requestId = 17/);
assert.doesNotThrow(
  () =>
    new vm.Script(
      helpers.makeExportItemScript(
        {
          path: [0, 1],
          filename: "Tree Oak.png",
        },
        "__EXPORT_SELECTED_TEMP__test-0",
      ),
    ),
);
assert.doesNotThrow(
  () =>
    new vm.Script(
      helpers.makeCleanupScript(
        "__EXPORT_SELECTED_TEMP__test-0",
        "Workfile.psd",
        "local,0,Workfile.psd",
      ),
    ),
);
assert.doesNotMatch(
  helpers.makeExportItemScript(
    { path: [0], filename: "Car Red.png" },
    "__EXPORT_SELECTED_TEMP__test-0",
  ),
  /saveToOE\(settings\.format\);\s*temporaryDocument\.close/,
);
assert.match(
  helpers.makeExportItemScript(
    { path: [0], filename: "Car Red.png" },
    "__EXPORT_SELECTED_TEMP__test-0",
  ),
  /sourceDocument\.duplicate\(\);\s*temporaryDocument = app\.activeDocument/,
);
assert.doesNotMatch(
  helpers.makeExportItemScript(
    { path: [0], filename: "Car Red.png" },
    "__EXPORT_SELECTED_TEMP__test-0",
  ),
  /temporaryDocument = sourceDocument\.duplicate\(\)/,
);
assert.match(
  helpers.makeCleanupScript(
    "__EXPORT_SELECTED_TEMP__test-0",
    "Workfile.psd",
    "local,0,Workfile.psd",
  ),
  /app\.activeDocument = temporaryDocument;[\s\S]*settings\.temporaryDocumentName[\s\S]*app\.activeDocument\.close\(SaveOptions\.DONOTSAVECHANGES\)/,
);

helpers.state.destination = "zip";
helpers.state.phase = "export";
helpers.state.embedded = true;
helpers.state.exportSession = {
  expected: 2,
  received: 0,
  index: 0,
  items: [
    { path: [0], filename: "Car Red.png" },
    { path: [1], filename: "Car Blue.png" },
  ],
  zipEntries: [],
  writes: [],
  filenames: [],
  stage: "exporting",
  current: {
    item: { path: [0], filename: "Car Red.png" },
    bufferReceived: false,
    doneReceived: false,
    temporaryDocumentName: "__EXPORT_SELECTED_TEMP__test-0",
  },
  cleanupResult: null,
  cleanupDoneReceived: false,
  finalizing: false,
  timeoutId: null,
};
helpers.handleExportBuffer(new Uint8Array([1, 2, 3]).buffer);
assert.equal(helpers.state.exportSession.received, 0);
assert.equal(helpers.state.exportSession.zipEntries[0].name, "Car Red.png");
assert.deepEqual(
  Array.from(helpers.state.exportSession.zipEntries[0].data),
  [1, 2, 3],
);
assert.equal(helpers.state.exportSession.stage, "exporting");
helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "cleanup");
assert.equal(fakeWindow.postedMessages.length, 1);
assert.match(fakeWindow.postedMessages[0], /EXPORT_SELECTED_CLEANUP/);

// The standard "done" message can arrive before echoToOE() cleanup metadata.
helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "cleanup");
assert.equal(helpers.state.exportSession.finalizing, false);
helpers.handleCleanupResult({
  ok: true,
  temporaryDocumentClosed: true,
  sourceDocumentRestored: true,
});
assert.equal(helpers.state.exportSession.received, 1);
assert.equal(helpers.state.exportSession.index, 1);
assert.equal(helpers.state.exportSession.stage, "exporting");
assert.equal(fakeWindow.postedMessages.length, 2);
assert.match(fakeWindow.postedMessages[1], /Car Blue\.png/);
helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "exporting");
assert.equal(helpers.state.exportSession.current.doneReceived, true);
helpers.handleExportBuffer(new Uint8Array([4, 5, 6]).buffer);
assert.equal(helpers.state.exportSession.stage, "cleanup");
assert.equal(fakeWindow.postedMessages.length, 3);
assert.match(fakeWindow.postedMessages[2], /EXPORT_SELECTED_CLEANUP/);

// Cleanup metadata can also arrive before the standard "done" message.
helpers.handleCleanupResult({
  ok: true,
  temporaryDocumentClosed: true,
  sourceDocumentRestored: true,
});
assert.equal(helpers.state.exportSession.stage, "cleanup");
helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.received, 2);

function cloneLayer(layer) {
  return {
    name: layer.name,
    visible: layer.visible,
    layers: layer.layers?.map(cloneLayer) || [],
  };
}

const sourceLayers = [
  { name: "Background", visible: true, layers: [] },
  {
    name: "Cars",
    visible: true,
    layers: [
      { name: "Car Red", visible: true, layers: [] },
      { name: "Car Blue", visible: true, layers: [] },
    ],
  },
  { name: "Overlay", visible: true, layers: [] },
];
const exportedVisibility = [];
const echoedMessages = [];
const sourceDocument = {
  layers: sourceLayers.map(cloneLayer),
  name: "Workfile.psd",
  source: "local,0,Workfile.psd",
  duplicate() {
    const duplicate = {
      name: "Workfile.psd",
      source: "local,0,Workfile.psd",
      layers: this.layers.map(cloneLayer),
      trim() {},
      saveToOE() {
        exportedVisibility.push(this.layers.map(cloneLayer));
      },
      close() {},
    };
    photopeaContext.app.documents.push(duplicate);
    photopeaContext.app.activeDocument = duplicate;
  },
};
const photopeaContext = {
  app: {
    documents: [sourceDocument],
    activeDocument: sourceDocument,
    echoToOE(message) {
      echoedMessages.push(message);
    },
  },
  TrimType: { TRANSPARENT: "transparent" },
  SaveOptions: { DONOTSAVECHANGES: "no" },
  JSON,
  Error,
};
vm.createContext(photopeaContext);
vm.runInContext(
  helpers.makeExportItemScript({
    path: [1, 1],
    filename: "Car Blue.png",
  }, "__EXPORT_SELECTED_TEMP__test-0"),
  photopeaContext,
);

assert.equal(exportedVisibility.length, 1);
assert.equal(exportedVisibility[0][0].visible, false);
assert.equal(exportedVisibility[0][1].visible, true);
assert.equal(exportedVisibility[0][1].layers[0].visible, false);
assert.equal(exportedVisibility[0][1].layers[1].visible, true);
assert.equal(exportedVisibility[0][2].visible, false);
assert.deepEqual(
  sourceDocument.layers.map((layer) => layer.visible),
  [true, true, true],
);
assert.equal(echoedMessages.length, 0);

const temporaryDocument = photopeaContext.app.documents[1];
let sourceClosed = false;
let temporaryClosed = false;
sourceDocument.close = () => {
  sourceClosed = true;
};
temporaryDocument.close = () => {
  temporaryClosed = true;
  const index = photopeaContext.app.documents.indexOf(temporaryDocument);
  photopeaContext.app.documents.splice(index, 1);
};

// Reproduce Photopea restoring the workfile before the cleanup message runs.
photopeaContext.app.activeDocument = sourceDocument;
vm.runInContext(
  helpers.makeCleanupScript(
    "__EXPORT_SELECTED_TEMP__test-0",
    "Workfile.psd",
    "local,0,Workfile.psd",
  ),
  photopeaContext,
);

assert.equal(sourceClosed, false);
assert.equal(temporaryClosed, true);
assert.equal(photopeaContext.app.activeDocument, sourceDocument);
assert.equal(photopeaContext.app.documents.length, 1);
assert.match(echoedMessages.at(-1), /"temporaryDocumentFound":true/);
assert.match(echoedMessages.at(-1), /"temporaryDocumentClosed":true/);
assert.match(echoedMessages.at(-1), /"sourceDocumentRestored":true/);

(async () => {
  const zip = helpers.createStoredZip([
    { name: "Car Red.png", data: new Uint8Array([1, 2, 3, 4]) },
    { name: "Tree Oak.png", data: new Uint8Array([5, 6, 7]) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());

  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.match(new TextDecoder().decode(bytes), /Car Red\.png/);
  assert.match(new TextDecoder().decode(bytes), /Tree Oak\.png/);

  console.log("Smoke tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
