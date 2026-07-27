"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  new URL("../app.js", `file://${__filename}`).pathname,
  "utf8",
);
const changelog = fs.readFileSync(
  new URL("../CHANGELOG.md", `file://${__filename}`).pathname,
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
  makeSnapshotScript,
  makePrepareTemporaryScript,
  makeCloseTemporaryScript,
  versionedPluginUrl,
  asArrayBuffer,
  handleExportBuffer,
  handlePhotopeaDone,
  handleExportItemResult,
  maybeCompleteExportItem,
  state
};`,
  context,
);

const helpers = context.__test;

assert.equal(helpers.sanitizeBaseName("Car:Red.png"), "Car_Red");
assert.equal(helpers.sanitizeBaseName("CON"), "_CON");
assert.equal(helpers.sanitizeBaseName("  Tree   Oak  "), "Tree Oak");
assert.match(root.innerHTML, /Export Selected Layers/);
assert.match(root.innerHTML, /v1\.0\.12/);
assert.match(root.innerHTML, /Tested with Photopea 5\.6/);
assert.match(root.innerHTML, /scripting v30/);
assert.match(changelog, /## \[1\.0\.12\] - 2026-07-27/);
assert.doesNotMatch(
  source,
  /state\.folderHandle\.requestPermission|handle\.requestPermission/,
);
assert.match(source, /openFolderPicker\("restore"\)/);
assert.equal(
  helpers.versionedPluginUrl(),
  "https://example.com/photopea-export-selected-layers/?v=1.0.12",
);

const inspectScript = helpers.makeInspectScript(17);
assert.doesNotThrow(() => new vm.Script(inspectScript));
assert.match(inspectScript, /var requestId = 17/);

const snapshotScript = helpers.makeSnapshotScript();
assert.doesNotThrow(() => new vm.Script(snapshotScript));
assert.match(snapshotScript, /app\.activeDocument\.saveToOE\("psd"\)/);
assert.doesNotMatch(snapshotScript, /\.duplicate\(|\.trim\(|\.close\(/);

const prepareScript = helpers.makePrepareTemporaryScript(
  { path: [0, 1], filename: "Tree Oak.png" },
  "__EXPORT_SELECTED_TEMP__test-0",
  "Workfile.psd",
  "local,0,Workfile.psd",
);
assert.doesNotThrow(() => new vm.Script(prepareScript));
assert.match(
  prepareScript,
  /temporaryDocument = app\.activeDocument[\s\S]*temporaryDocument\.name = settings\.temporaryDocumentName/,
);
assert.match(
  prepareScript,
  /rasterizeAllLayers[\s\S]*mergeVisibleLayers[\s\S]*saveToOE\(settings\.format\)/,
);
assert.doesNotMatch(prepareScript, /\.duplicate\(/);
assert.doesNotMatch(
  prepareScript.slice(0, prepareScript.indexOf("} catch (error)")),
  /\.close\(/,
);

const closeScript = helpers.makeCloseTemporaryScript(
  "__EXPORT_SELECTED_TEMP__test-0",
  "Workfile.psd",
  "local,0,Workfile.psd",
);
assert.doesNotThrow(() => new vm.Script(closeScript));
assert.match(
  closeScript,
  /app\.activeDocument = temporaryDocument[\s\S]*temporaryDocument\.close\(SaveOptions\.DONOTSAVECHANGES\)[\s\S]*app\.activeDocument = sourceDocument/,
);
assert.doesNotMatch(source, /sourceDocument\.duplicate\(/);

// Drive the documented Photopea message lifecycle:
// PSD snapshot buffer -> done -> open buffer -> done -> image buffer -> done
// -> close confirmation / done.
helpers.state.destination = "zip";
helpers.state.phase = "export";
helpers.state.embedded = true;
helpers.state.documentName = "Workfile.psd";
helpers.state.documentSource = "local,0,Workfile.psd";
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
  stage: "snapshotting",
  current: null,
  finalizing: false,
  timeoutId: null,
  token: "test",
  snapshotBuffer: null,
  snapshotDone: false,
};

const psdBuffer = new Uint8Array([8, 66, 80, 83]).buffer;
helpers.handleExportBuffer(psdBuffer);
assert.equal(helpers.state.exportSession.snapshotBuffer, psdBuffer);
assert.equal(fakeWindow.postedMessages.length, 0);

helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "opening-temporary");
assert.equal(fakeWindow.postedMessages.length, 1);
assert.ok(fakeWindow.postedMessages[0] instanceof ArrayBuffer);
assert.deepEqual(
  Array.from(new Uint8Array(fakeWindow.postedMessages[0])),
  [8, 66, 80, 83],
);

helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "rendering");
assert.equal(fakeWindow.postedMessages.length, 2);
assert.match(fakeWindow.postedMessages[1], /Car Red\.png/);
assert.match(fakeWindow.postedMessages[1], /saveToOE\(settings\.format\)/);

helpers.handleExportBuffer(new Uint8Array([1, 2, 3]).buffer);
assert.equal(helpers.state.exportSession.received, 0);
assert.equal(helpers.state.exportSession.zipEntries[0].name, "Car Red.png");
assert.deepEqual(
  Array.from(helpers.state.exportSession.zipEntries[0].data),
  [1, 2, 3],
);
assert.equal(helpers.state.exportSession.stage, "rendering");

helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "closing-temporary");
assert.equal(fakeWindow.postedMessages.length, 3);
assert.match(fakeWindow.postedMessages[2], /temporaryDocument\.close/);

// Cleanup metadata may arrive before Photopea's generic done message.
helpers.handleExportItemResult({
  ok: true,
  temporaryDocumentClosed: true,
  sourceDocumentRestored: true,
});
assert.equal(helpers.state.exportSession.received, 0);
helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.received, 1);
assert.equal(helpers.state.exportSession.index, 1);
assert.equal(helpers.state.exportSession.stage, "opening-temporary");
assert.equal(fakeWindow.postedMessages.length, 4);
assert.ok(fakeWindow.postedMessages[3] instanceof ArrayBuffer);

helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "rendering");
assert.match(fakeWindow.postedMessages[4], /Car Blue\.png/);

// The documented done message can be observed before the panel receives the
// image buffer; cleanup still starts only after both have arrived.
helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.stage, "rendering");
helpers.handleExportBuffer(new Uint8Array([4, 5, 6]).buffer);
assert.equal(helpers.state.exportSession.stage, "closing-temporary");
assert.match(fakeWindow.postedMessages[5], /temporaryDocument\.close/);

// The cleanup done message can also precede explicit cleanup metadata.
helpers.handlePhotopeaDone();
assert.equal(helpers.state.exportSession.received, 1);
helpers.handleExportItemResult({
  ok: true,
  temporaryDocumentClosed: true,
  sourceDocumentRestored: true,
});
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
const originalDocument = {
  layers: sourceLayers.map(cloneLayer),
  name: "Workfile.psd",
  source: "local,0,Workfile.psd",
  saveToOE(format) {
    this.snapshotFormat = format;
  },
};
const temporaryDocument = {
  layers: sourceLayers.map(cloneLayer),
  name: "Workfile.psd",
  source: "local,1,Workfile.psd",
  trim() {
    this.trimmed = true;
  },
  rasterizeAllLayers() {
    this.rasterized = true;
  },
  mergeVisibleLayers() {
    this.merged = true;
  },
  saveToOE(format) {
    this.exportFormat = format;
    this.exportedVisibility = this.layers.map(cloneLayer);
  },
  close() {
    this.closed = true;
    const index = photopeaContext.app.documents.indexOf(this);
    photopeaContext.app.documents.splice(index, 1);
  },
};
const echoedMessages = [];
const photopeaContext = {
  app: {
    documents: [originalDocument, temporaryDocument],
    activeDocument: temporaryDocument,
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

const snapshotContext = {
  app: {
    documents: [originalDocument],
    activeDocument: originalDocument,
    echoToOE() {},
  },
  JSON,
  Error,
};
vm.createContext(snapshotContext);
vm.runInContext(snapshotScript, snapshotContext);
assert.equal(originalDocument.snapshotFormat, "psd");

vm.runInContext(
  helpers.makePrepareTemporaryScript(
    { path: [1, 1], filename: "Car Blue.png" },
    "__EXPORT_SELECTED_TEMP__test-0",
    "Workfile.psd",
    "local,0,Workfile.psd",
  ),
  photopeaContext,
);

assert.equal(temporaryDocument.name, "__EXPORT_SELECTED_TEMP__test-0");
assert.equal(temporaryDocument.rasterized, true);
assert.equal(temporaryDocument.merged, true);
assert.equal(temporaryDocument.trimmed, true);
assert.equal(temporaryDocument.exportFormat, "png");
assert.equal(temporaryDocument.closed, undefined);
assert.equal(temporaryDocument.exportedVisibility[0].visible, false);
assert.equal(temporaryDocument.exportedVisibility[1].visible, true);
assert.equal(temporaryDocument.exportedVisibility[1].layers[0].visible, false);
assert.equal(temporaryDocument.exportedVisibility[1].layers[1].visible, true);
assert.equal(temporaryDocument.exportedVisibility[2].visible, false);
assert.deepEqual(
  originalDocument.layers.map((layer) => layer.visible),
  [true, true, true],
);
assert.equal(photopeaContext.app.activeDocument, temporaryDocument);

vm.runInContext(
  helpers.makeCloseTemporaryScript(
    "__EXPORT_SELECTED_TEMP__test-0",
    "Workfile.psd",
    "local,0,Workfile.psd",
  ),
  photopeaContext,
);

assert.equal(temporaryDocument.closed, true);
assert.equal(photopeaContext.app.documents.length, 1);
assert.equal(photopeaContext.app.activeDocument, originalDocument);
assert.equal(echoedMessages.length, 1);
assert.match(echoedMessages[0], /EXPORT_SELECTED_ITEM_RESULT::/);
assert.match(echoedMessages[0], /"temporaryDocumentClosed":true/);
assert.match(echoedMessages[0], /"sourceDocumentRestored":true/);

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
