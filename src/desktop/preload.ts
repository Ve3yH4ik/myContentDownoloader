import { contextBridge, ipcRenderer } from "electron";
import type { DownloaderApi, SessionState } from "../shared/api";
const api: DownloaderApi = {
  state: () => ipcRenderer.invoke("state"),
  subscribe: (listener) => {
    const handler = (_event: unknown, state: SessionState) => listener(state);
    ipcRenderer.on("state-changed", handler);
    return () => {
      ipcRenderer.removeListener("state-changed", handler);
    };
  },
  patch: (patch) => ipcRenderer.invoke("patch", patch),
  replace: (project) => ipcRenderer.invoke("replace", project),
  window: (kind) => ipcRenderer.invoke("window", kind),
  run: (project) => ipcRenderer.invoke("run", project),
  runQueue: () => ipcRenderer.invoke("run-queue"),
  stop: () => ipcRenderer.invoke("stop"),
  save: (project) => ipcRenderer.invoke("save", project),
  list: () => ipcRenderer.invoke("list"),
  open: (id) => ipcRenderer.invoke("open", id),
  scan: (url, sameOrigin) => ipcRenderer.invoke("scan", url, sameOrigin),
  preview: (template) => ipcRenderer.invoke("preview", template),
  export: (content, format) => ipcRenderer.invoke("export", content, format),
};
contextBridge.exposeInMainWorld("downloader", api);
