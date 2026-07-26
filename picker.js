"use strict";

const DB_NAME = "photopea-export-selected-layers";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const DIRECTORY_KEY = "export-directory";
const READY_MESSAGE = "EXPORT_SELECTED_DIRECTORY_READY";
const CANCEL_MESSAGE = "EXPORT_SELECTED_DIRECTORY_CANCELLED";

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

function notifyOpener(type, detail = {}) {
  if (!window.opener) return;
  window.opener.postMessage({ type, ...detail }, window.location.origin);
}

function setStatus(message, kind = "") {
  const status = document.querySelector("#picker-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

async function chooseFolder() {
  if (!("showDirectoryPicker" in window)) {
    setStatus(
      "This browser does not support direct folder access. Use ZIP download in the plugin.",
      "error",
    );
    notifyOpener(CANCEL_MESSAGE, { reason: "unsupported" });
    return;
  }

  const button = document.querySelector("#choose-folder");
  button.disabled = true;
  setStatus("Waiting for a folder…");

  try {
    const handle = await window.showDirectoryPicker({
      id: "photopea-export-selected-layers",
      mode: "readwrite",
      startIn: "pictures",
    });

    await storeDirectoryHandle(handle);
    setStatus(`Using “${handle.name}”. You can return to Photopea.`, "ok");
    notifyOpener(READY_MESSAGE, { name: handle.name, handle });
    setTimeout(() => window.close(), 650);
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus("No folder was selected.", "error");
      notifyOpener(CANCEL_MESSAGE, { reason: "cancelled" });
    } else {
      setStatus(
        error?.message || "The folder could not be opened.",
        "error",
      );
      notifyOpener(CANCEL_MESSAGE, { reason: "error" });
    }
    button.disabled = false;
  }
}

document
  .querySelector("#choose-folder")
  ?.addEventListener("click", chooseFolder);
