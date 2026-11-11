import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { ProjectStore } from "../core/store";
import { projectSchema, type Project } from "../core/schema";
import { renderTemplate } from "../core/macros";
import { toCsv, type RunResult } from "../core/engine";
import example from "../../examples/products.json";
import type { SessionState, WindowKind } from "../shared/api";
let worker: Worker | undefined;
let stopped = false;
let store: ProjectStore;
let mainWindow: BrowserWindow;
let previewContexts: {
  rows: RunResult["rows"];
  boundaries: Record<string, string>;
}[] = [];
function previewContext(result: RunResult) {
  return {
    rows: result.rows,
    boundaries: Object.fromEntries(
      result.boundaries.map((b) => [b.id, b.joined]),
    ),
  };
}
const children = new Map<WindowKind, BrowserWindow>();
const titles: Record<WindowKind, string> = {
  settings: "Налаштування HTTP і проєкту",
  template: "Редактор шаблону",
  scanner: "Вебсканер",
  boundaries: "Редактор границь",
  report: "Звіт виконання",
  projects: "Збережені проєкти",
};
let state: SessionState = {
  project: projectSchema.parse(example),
  busy: false,
  status: "Готово до запуску",
  history: [],
};
function publish() {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send("state-changed", state);
}
function idle() {
  if (state.busy) throw new Error("Спочатку зупиніть активну операцію");
}
function configure(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
}
function openWindow(kind: WindowKind) {
  if (!Object.hasOwn(titles, kind)) throw new Error("Unknown window");
  const existing = children.get(kind);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  const window = new BrowserWindow({
    parent: mainWindow,
    title: titles[kind],
    width: kind === "report" ? 1150 : 1000,
    height: 760,
    minWidth: 740,
    minHeight: 540,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  children.set(kind, window);
  configure(window);
  window.removeMenu();
  window.on("closed", () => children.delete(kind));
  void window.loadFile(join(__dirname, "../renderer/index.html"), {
    query: { view: kind },
  });
}
function execute<T>(data: unknown, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const active = new Worker(join(__dirname, "worker.cjs"), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    worker = active;
    let settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (worker === active) worker = undefined;
      void active
        .terminate()
        .finally(() => (error ? reject(error) : resolve(value!)));
    };
    const deadline = setTimeout(
      () => finish(new Error("Execution deadline exceeded")),
      timeoutMs + 10000,
    );
    active.once("message", (m) =>
      finish(m.error ? new Error(m.error) : undefined, m.result),
    );
    active.once("error", (e) =>
      finish(e instanceof Error ? e : new Error(String(e))),
    );
    active.once("exit", () =>
      finish(
        new Error(stopped ? "Run stopped" : "Worker exited before result"),
      ),
    );
  });
}
async function runSingle(project: Project): Promise<RunResult> {
  const start = performance.now();
  try {
    const result = await execute<RunResult>(
      { kind: "run", project },
      project.timeoutMs,
    );
    state.result = result;
    previewContexts = [previewContext(result)];
    state.history.push({
      url: project.url,
      status: "ok",
      rows: result.rows.length,
      durationMs: performance.now() - start,
      message: result.log[0],
      time: new Date().toISOString(),
    });
    return result;
  } catch (e) {
    state.history.push({
      url: project.url,
      status: "error",
      rows: 0,
      durationMs: performance.now() - start,
      message: String(e instanceof Error ? e.message : e),
      time: new Date().toISOString(),
    });
    throw e;
  } finally {
    state.history = state.history.slice(-1000);
    publish();
  }
}
function setError(error: unknown) {
  state.status = error instanceof Error ? error.message : String(error);
  publish();
}
function saveProject() {
  idle();
  const id = store.save(state.project);
  state.status = `Збережено версію №${id}`;
  publish();
  return id;
}
app.whenReady().then(() => {
  store = new ProjectStore(join(app.getPath("userData"), "projects.sqlite"));
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: "Universal Data Downloader",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  configure(mainWindow);
  const action = (fn: () => unknown) => () => {
    try {
      fn();
    } catch (e) {
      setError(e);
    }
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Файл",
        submenu: [
          {
            label: "Новий проєкт",
            accelerator: "CmdOrCtrl+N",
            click: action(() => {
              idle();
              state.project = projectSchema.parse(example);
              state.result = undefined;
              state.status = "Створено новий проєкт";
              publish();
            }),
          },
          {
            label: "Відкрити проєкт…",
            accelerator: "CmdOrCtrl+O",
            click: () => openWindow("projects"),
          },
          {
            label: "Зберегти проєкт",
            accelerator: "CmdOrCtrl+S",
            click: action(saveProject),
          },
          { type: "separator" },
          { role: "quit", label: "Вихід" },
        ],
      },
      {
        label: "Налаштування",
        submenu: [
          { label: "HTTP і проєкт…", click: () => openWindow("settings") },
          { label: "Границі парсингу…", click: () => openWindow("boundaries") },
          { label: "Шаблон результату…", click: () => openWindow("template") },
        ],
      },
      {
        label: "Сервіс",
        submenu: [
          { label: "Звіт виконання…", click: () => openWindow("report") },
          { label: "Збережені версії…", click: () => openWindow("projects") },
        ],
      },
      {
        label: "Web",
        submenu: [
          { label: "Вебсканер / Sitemap…", click: () => openWindow("scanner") },
        ],
      },
      {
        label: "Інтерфейс",
        submenu: [
          { role: "resetZoom", label: "Масштаб 100%" },
          { role: "zoomIn", label: "Збільшити" },
          { role: "zoomOut", label: "Зменшити" },
          { role: "togglefullscreen", label: "Повний екран" },
        ],
      },
      {
        label: "Довідка",
        submenu: [
          {
            label: "Про програму",
            click: () => {
              void dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "Universal Data Downloader",
                message: "Universal Data Downloader 0.2",
                detail:
                  "HTTP, вкладені границі, шаблони, черга URL та сканування посилань. CDX1 compatibility не підтверджена. Вебсканер обробляє одну HTML-сторінку або sitemap, без JavaScript і рекурсивного обходу.",
              });
            },
          },
        ],
      },
    ]),
  );
  ipcMain.handle("state", () => state);
  ipcMain.handle("patch", (_e, patch) => {
    idle();
    state.project = projectSchema.parse({ ...state.project, ...patch });
    publish();
  });
  ipcMain.handle("replace", (_e, project) => {
    idle();
    state.project = projectSchema.parse(project);
    state.result = undefined;
    previewContexts = [];
    publish();
  });
  ipcMain.handle("window", (_e, kind) => openWindow(kind));
  ipcMain.handle("run", async (_e, input) => {
    idle();
    const project = projectSchema.parse(input);
    state.project = project;
    state.busy = true;
    state.result = undefined;
    stopped = false;
    state.status = "Завантаження та обробка…";
    publish();
    try {
      const result = await runSingle(project);
      state.status = `Завершено · ${result.rows.length} рядків`;
      return result;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      state.busy = false;
      publish();
    }
  });
  ipcMain.handle("run-queue", async () => {
    idle();
    const project = state.project;
    if (!project.urlQueue.length) throw new Error("Черга URL порожня");
    stopped = false;
    state.busy = true;
    state.result = undefined;
    const rows: Record<string, string>[] = [];
    const outputs: string[] = [];
    const contexts: typeof previewContexts = [];
    let last: RunResult | undefined;
    let errors = 0;
    publish();
    try {
      for (const [index, url] of project.urlQueue.entries()) {
        if (stopped) break;
        state.status = `Черга ${index + 1}/${project.urlQueue.length}: ${url}`;
        publish();
        try {
          const result = await runSingle({ ...project, url });
          last = result;
          rows.push(...result.rows.map((row) => ({ ...row, _url: url })));
          outputs.push(result.output);
          contexts.push(previewContext(result));
        } catch {
          errors++;
        }
      }
      if (last)
        state.result = {
          ...last,
          rows,
          json: JSON.stringify(rows, null, 2),
          csv: toCsv(rows),
          output: outputs.join("\n"),
          log: [...last.log, `Queue: ${rows.length} rows; ${errors} errors`],
        };
      state.status = stopped
        ? "Чергу зупинено"
        : `Чергу завершено · ${rows.length} рядків · помилок: ${errors}`;
      previewContexts = contexts;
    } finally {
      state.busy = false;
      publish();
    }
  });
  ipcMain.handle("stop", async () => {
    stopped = true;
    await worker?.terminate();
  });
  ipcMain.handle("save", (_e, input) => {
    idle();
    state.project = projectSchema.parse(input);
    return saveProject();
  });
  ipcMain.handle("list", () => store.list());
  ipcMain.handle("open", (_e, id) => {
    idle();
    if (!Number.isInteger(id)) throw new Error("Invalid project ID");
    const project = store.open(id);
    state.project = project;
    state.result = undefined;
    state.status = `Відкрито версію №${id}`;
    publish();
    return project;
  });
  ipcMain.handle("scan", async (_e, url, sameOrigin) => {
    idle();
    const project = projectSchema.parse({
      ...state.project,
      scannerUrl: url,
      scannerSameOrigin: sameOrigin,
    });
    if (!project.scannerUrl) throw new Error("Вкажіть URL");
    state.project = project;
    state.busy = true;
    stopped = false;
    state.status = "Сканування посилань…";
    publish();
    try {
      const links = await execute<string[]>(
        {
          kind: "scan",
          url: project.scannerUrl,
          sameOrigin: project.scannerSameOrigin,
          timeoutMs: project.timeoutMs,
        },
        project.timeoutMs,
      );
      state.status = `Знайдено ${links.length} посилань`;
      return links;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      state.busy = false;
      publish();
    }
  });
  ipcMain.handle("preview", (_e, template) => {
    if (typeof template !== "string") throw new Error("Invalid template");
    if (!state.result) throw new Error("Спочатку виконайте сценарій");
    return previewContexts
      .flatMap((context) =>
        context.rows.map((row, index) =>
          renderTemplate(template, {
            value: JSON.stringify(row),
            count: context.rows.length,
            index: index + 1,
            boundaries: context.boundaries,
          }),
        ),
      )
      .join("\n");
  });
  ipcMain.handle("export", async (event, content, format) => {
    if (typeof content !== "string" || !["csv", "json"].includes(format))
      throw new Error("Invalid export");
    const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    const target = await dialog.showSaveDialog(owner, {
      defaultPath: `result.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (target.canceled || !target.filePath) return false;
    await writeFile(
      target.filePath,
      (format === "csv" ? "\ufeff" : "") + content,
      "utf8",
    );
    return true;
  });
  mainWindow.on("closed", () => {
    for (const window of children.values()) window.destroy();
  });
  void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
});
app.on("window-all-closed", () => {
  void worker?.terminate();
  store?.close();
  app.quit();
});
