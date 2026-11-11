import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
} from "electron";
import { createServices } from "./services";
import { requestProfileSchema } from "../core/request-profile";
import iconv from "iconv-lite";
import { readdirSync, existsSync } from "node:fs";
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
const activeWorkers = new Set<Worker>();
let stopped = false;
let store: ProjectStore;
let mainWindow: BrowserWindow;
let services: ReturnType<typeof createServices>;
let tray: Tray | undefined;
let quitting = false;
let appearance: "dark" | "light" = "dark";
const windowAppearance = () => ({
  backgroundColor: appearance === "dark" ? "#0d1421" : "#f2f5fa",
  titleBarStyle: "hidden" as const,
  titleBarOverlay: {
    color: appearance === "dark" ? "#0d1421" : "#f2f5fa",
    symbolColor: appearance === "dark" ? "#d5e2f3" : "#33465d",
    height: 36,
  },
  show: false,
  autoHideMenuBar: true,
});
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
  http: "HTTP Engine",
  browser: "Browser Automation",
  proxies: "Proxy Manager",
  application: "Application Settings",
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
  let revealed = false;
  const reveal = () => {
    if (revealed || window.isDestroyed()) return;
    revealed = true;
    window.show();
  };
  window.once("ready-to-show", reveal);
  window.webContents.once("did-finish-load", reveal);
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
    ...windowAppearance(),
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
function execute<T>(
  data: unknown,
  timeoutMs: number,
  parseOnly = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const active = new Worker(join(__dirname, "worker.cjs"), {
      workerData: data,
      resourceLimits: {
        maxOldGenerationSizeMb:
          services?.settings.read().performance.maxWorkerMb ?? 256,
      },
    });
    worker = active;
    activeWorkers.add(active);
    let settled = false;
    let parseDeadline: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(parseDeadline);
      if (worker === active) worker = undefined;
      activeWorkers.delete(active);
      void active
        .terminate()
        .finally(() => (error ? reject(error) : resolve(value!)));
    };
    const deadline = setTimeout(
      () => finish(new Error("Execution deadline exceeded")),
      parseOnly ? timeoutMs : timeoutMs + 10000,
    );
    active.on("message", (m) => {
      if (m.phase === "parsing") {
        parseDeadline = setTimeout(
          () => finish(new Error("Parsing/Regex deadline exceeded")),
          services.settings.read().regex.executionTimeoutMs,
        );
      } else finish(m.error ? new Error(m.error) : undefined, m.result);
    });
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
  project = { ...project, requestProfile: services.profile(project) };
  const start = performance.now();
  const resolved = await services.resolveProfile(services.profile(project));
  let succeeded = false;
  try {
    const result = await execute<RunResult>(
      {
        kind: "run",
        project,
        secrets: resolved.secrets,
      },
      project.requestProfile?.totalTimeoutMs ?? project.timeoutMs,
    );
    state.result = result;
    succeeded = true;
    const csv = services.settings.read().csv;
    result.csv = toCsv(
      result.rows,
      csv.delimiter,
      csv.lineEnding === "LF" ? "\n" : "\r\n",
    );
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
    await services.recordProxy(
      resolved.proxy,
      succeeded,
      performance.now() - start,
    );
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
  const saved = structuredClone(state.project);
  if (
    !services.settings.read().general.saveProxyReferences &&
    saved.requestProfile
  )
    saved.requestProfile.proxyId = "";
  const id = store.save(saved);
  state.status = `Збережено версію №${id}`;
  publish();
  return id;
}
app.whenReady().then(() => {
  const browserRoot = app.isPackaged
    ? join(process.resourcesPath, "browsers")
    : join(app.getAppPath(), "vendor", "browsers");
  const chromiumFolder = existsSync(browserRoot)
    ? readdirSync(browserRoot).find((name) => name.startsWith("chromium-"))
    : undefined;
  if (chromiumFolder)
    process.env.UDD_CHROMIUM_PATH = join(
      browserRoot,
      chromiumFolder,
      "chrome-win64",
      "chrome.exe",
    );
  store = new ProjectStore(join(app.getPath("userData"), "projects.sqlite"));
  mainWindow = new BrowserWindow({
    ...windowAppearance(),
    icon: app.isPackaged
      ? join(process.resourcesPath, "app.ico")
      : join(app.getAppPath(), "build", "app.ico"),
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
  services = createServices(
    () => state.project,
    (result) => {
      const csv = services.settings.read().csv;
      result.csv = toCsv(
        result.rows,
        csv.delimiter,
        csv.lineEnding === "LF" ? "\n" : "\r\n",
      );
      state.result = result;
      previewContexts = [previewContext(result)];
      state.status = `Завершено · ${result.rows.length} рядків`;
      publish();
    },
    (settings) => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send("application-settings", settings);
    },
    (source) =>
      execute<RunResult>(
        { kind: "parse", project: state.project, document: source },
        services.settings.read().regex.executionTimeoutMs,
        true,
      ),
  );
  mainWindow.on("minimize", () => {
    if (services.settings.read().general.minimizeToTray) {
      mainWindow.hide();
      if (!tray) {
        tray = new Tray(
          nativeImage.createFromDataURL(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          ),
        );
        tray.setToolTip("Universal Data Downloader");
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: "Відкрити", click: () => mainWindow.show() },
            { label: "Вихід", click: () => app.quit() },
          ]),
        );
        tray.on("double-click", () => mainWindow.show());
      }
    }
  });
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
          {
            label: "Налаштування програми…",
            click: () => openWindow("application"),
          },
          {
            label: "RequestProfile / HTTP Engine…",
            click: () => openWindow("http"),
          },
          { label: "Proxy Manager…", click: () => openWindow("proxies") },
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
          { label: "Browser Automation…", click: () => openWindow("browser") },
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
                message: "Universal Data Downloader 0.4",
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
  ipcMain.handle("appearance", (_event, theme) => {
    if (theme !== "light" && theme !== "dark") throw new Error("Unknown theme");
    appearance = theme;
    nativeTheme.themeSource = theme;
    for (const window of BrowserWindow.getAllWindows()) {
      window.setBackgroundColor(windowAppearance().backgroundColor);
      window.setTitleBarOverlay(windowAppearance().titleBarOverlay);
    }
  });
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
      const results: { result: RunResult; url: string }[] = [];
      let cursor = 0;
      let collected = 0;
      const consume = async () => {
        while (!stopped && cursor < project.urlQueue.length) {
          const index = cursor++;
          const url = project.urlQueue[index];
          state.status = `Черга ${index + 1}/${project.urlQueue.length}: ${url}`;
          publish();
          try {
            const result = await runSingle({ ...project, url });
            collected += result.rows.length;
            if (collected > services.settings.read().performance.maxQueueRows) {
              stopped = true;
              throw new Error("Queue row limit exceeded");
            }
            results[index] = { result, url };
          } catch {
            errors++;
          }
        }
      };
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              services.settings.read().performance.threads,
              project.urlQueue.length,
            ),
          },
          consume,
        ),
      );
      for (const entry of results) {
        if (!entry) continue;
        last = entry.result;
        rows.push(
          ...entry.result.rows.map((row) => ({ ...row, _url: entry.url })),
        );
        outputs.push(entry.result.output);
        contexts.push(previewContext(entry.result));
      }
      if (last)
        state.result = {
          ...last,
          rows,
          json: JSON.stringify(rows, null, 2),
          csv: toCsv(
            rows,
            services.settings.read().csv.delimiter,
            services.settings.read().csv.lineEnding === "LF" ? "\n" : "\r\n",
          ),
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
    await Promise.all([...activeWorkers].map((active) => active.terminate()));
  });
  ipcMain.handle("save", (_e, input) => {
    idle();
    state.project = projectSchema.parse(input);
    return saveProject();
  });
  ipcMain.handle("list", () => store.list());
  ipcMain.handle("open", async (_e, id) => {
    idle();
    if (!Number.isInteger(id)) throw new Error("Invalid project ID");
    let project = store.open(id);
    let mode = services.settings.read().policies.manual;
    if (mode === "ask") {
      const answer = await dialog.showMessageBox(mainWindow, {
        message: "Як відкрити проєкт?",
        buttons: ["Замінити", "Об’єднати", "Залишити поточний"],
        cancelId: 2,
      });
      mode =
        answer.response === 0
          ? "replace"
          : answer.response === 1
            ? "merge"
            : "keep";
    }
    if (mode === "keep") return state.project;
    if (mode === "merge")
      project = projectSchema.parse({
        ...state.project,
        ...project,
        boundaries: [
          ...new Map(
            [...state.project.boundaries, ...project.boundaries].map((b) => [
              b.id,
              b,
            ]),
          ).values(),
        ],
        urlQueue: [
          ...new Set([...state.project.urlQueue, ...project.urlQueue]),
        ],
      });
    if (mode === "rename") {
      const base = project.name;
      let suffix = 2;
      const existing = store.list().map((p) => p.name);
      while (existing.includes(project.name))
        project.name = `${base} (${suffix++})`;
    }
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
    const output = previewContexts
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
    services.recordPreview(output);
    return output;
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
      iconv.encode(
        (format === "csv" && services.settings.read().csv.bom ? "\ufeff" : "") +
          content,
        services.settings.read().encodings.export,
      ),
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
app.on("before-quit", (event) => {
  if (!quitting && services) {
    event.preventDefault();
    quitting = true;
    void services.close().finally(() => {
      tray?.destroy();
      app.quit();
    });
  }
});
