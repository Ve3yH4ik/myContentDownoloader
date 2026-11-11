import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('downloader', {
  run: (project: unknown) => ipcRenderer.invoke('run', project),
  stop: () => ipcRenderer.invoke('stop'),
  save: (project: unknown) => ipcRenderer.invoke('save', project),
  list: () => ipcRenderer.invoke('list'),
  open: (id: number) => ipcRenderer.invoke('open', id),
  export: (content: string, format: 'csv' | 'json') => ipcRenderer.invoke('export', content, format),
});
