import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ProjectStore } from '../core/store';
import { projectSchema } from '../core/schema';
let worker: Worker | undefined;
let store: ProjectStore;
app.whenReady().then(() => {
  store = new ProjectStore(join(app.getPath('userData'), 'projects.sqlite'));
  const window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1000, minHeight: 700, title: 'Universal Data Downloader', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('run', (_event, input) => {
    if (worker) throw new Error('A run is already active');
    const project = projectSchema.parse(input);
    return new Promise((resolve, reject) => {
      const active = new Worker(join(__dirname, 'worker.cjs'), { workerData: project, resourceLimits: { maxOldGenerationSizeMb: 256 } });
      worker = active;
      const deadline = setTimeout(() => { void active.terminate(); reject(new Error('Execution deadline exceeded')); }, project.timeoutMs + 10000);
      active.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message.result));
      active.once('error', reject);
      active.once('exit', () => { clearTimeout(deadline); if (worker === active) worker = undefined; reject(new Error('Run stopped')); });
    });
  });
  ipcMain.handle('stop', async () => { await worker?.terminate(); worker = undefined; });
  ipcMain.handle('save', (_event, input) => store.save(input));
  ipcMain.handle('list', () => store.list());
  ipcMain.handle('open', (_event, id) => { if (!Number.isInteger(id)) throw new Error('Invalid project ID'); return store.open(id); });
  ipcMain.handle('export', async (_event, content, format) => {
    if (typeof content !== 'string' || !['csv', 'json'].includes(format)) throw new Error('Invalid export');
    const target = await dialog.showSaveDialog(window, { defaultPath: `result.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (target.canceled || !target.filePath) return false;
    await writeFile(target.filePath, (format === 'csv' ? '\ufeff' : '') + content, 'utf8'); return true;
  });
  window.removeMenu();
  void window.loadFile(join(__dirname, '../renderer/index.html'));
});
app.on('window-all-closed', () => { void worker?.terminate(); store?.close(); app.quit(); });
