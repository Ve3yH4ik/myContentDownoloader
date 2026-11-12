import { contextBridge, ipcRenderer } from "electron";
import type { DownloaderApi, SessionState } from "../shared/api";
const api: DownloaderApi = {
  appearance:theme=>ipcRenderer.invoke('appearance',theme),
  subscribeSettings: (listener) => {
    const handler = (
      _event: unknown,
      value: import("../core/settings").AppSettings,
    ) => listener(value);
    ipcRenderer.on("application-settings", handler);
    return () => {
      ipcRenderer.removeListener("application-settings", handler);
    };
  },
  service: (action, input) => ipcRenderer.invoke("service", action, input),
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
  window: (kind,id) => ipcRenderer.invoke("window", kind,id),
  subscribeBoundaryFocus:listener=>{const handler=(_event:unknown,id:string)=>listener(id);ipcRenderer.on('boundary-focus',handler);return()=>{ipcRenderer.removeListener('boundary-focus',handler);};},
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
