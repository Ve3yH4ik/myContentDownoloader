import { app, dialog, ipcMain } from "electron";
import { join, resolve } from "node:path";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import iconv from "iconv-lite";
import { SecretVault } from "./vault";
import {
  SettingsStore,
  defaultSettings,
  applyPolicy,
  type AppSettings,
} from "../core/settings";
import {
  BrowserEngine,
  browserActionSchema,
  type BrowserSnapshot,
} from "../core/browser";
import { httpRequest } from "../core/http";
import {
  requestProfileSchema,
  type RequestProfile,
  type ResolvedSecrets,
  type HttpResult,
} from "../core/request-profile";
import {
  ProxyPool,
  proxySchema,
  parseProxyImport,
  proxyUrl,
  testProxy,
  type ProxyProfile,
} from "../core/proxies";
import { parseDocument, type RunResult } from "../core/engine";
import type { Project } from "../core/schema";
export function createServices(
  getProject: () => Project,
  onResult: (r: RunResult) => void,
  onSettings: (s: AppSettings) => void,
  parseSource:(source:string)=>Promise<RunResult>,
) {
  const root = app.getPath("userData");
  const vault = new SecretVault(join(root, "secrets.dpapi.json"));
  const settings = new SettingsStore(join(root, "settings.json"));
  const browser = new BrowserEngine();
  const pool = new ProxyPool();
  let proxies: ProxyProfile[] = [];
  let proxyLog: {
    id: string;
    ok: boolean;
    durationMs: number;
    time: string;
  }[] = [];
  let lastHttp: HttpResult | undefined;
  let lastBrowser: BrowserSnapshot | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let checking = false;
  let previewHistory: { time: string; before: string; after: string }[] = [];
  const proxyFile = join(root, "proxies.json");
  const proxyStateFile = join(root, "proxy-state.json");
  let schedule = { url: "", seconds: 0 };
  const cacheRoot = join(root, "http-response-cache");
  const ready = readFile(proxyFile, "utf8")
    .then((s) => {
      proxies = JSON.parse(s).map((p: unknown) => proxySchema.parse(p));
    })
    .catch((e) => {
      if (e.code !== "ENOENT") throw e;
    })
    .then(async () => {
      try {
        const saved = JSON.parse(await readFile(proxyStateFile, "utf8"));
        proxyLog = Array.isArray(saved.log) ? saved.log.slice(-1000) : [];
        if (saved.schedule?.seconds >= 30 && saved.schedule.seconds <= 86400) {
          schedule = {
            url: requestProfileSchema.parse({ url: saved.schedule.url }).url,
            seconds: saved.schedule.seconds,
          };
          timer = setInterval(() => {
            void checkAll(schedule.url).catch(() => {});
          }, schedule.seconds * 1000);
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    });
  let persistence = Promise.resolve();
  const persist = () => {
    const content = JSON.stringify(proxies, null, 2);
    const metadata = JSON.stringify({ log: proxyLog, schedule });
    persistence = persistence
      .catch(() => {})
      .then(async () => {
        await writeFile(proxyFile, content, "utf8");
        await writeFile(proxyStateFile, metadata, "utf8");
      });
    return persistence;
  };
  async function recordProxy(
    profile: ProxyProfile | undefined,
    ok: boolean,
    durationMs: number,
  ) {
    if (!profile) return;
    profile[ok ? "success" : "failure"]++;
    proxyLog.push({
      id: profile.id,
      ok,
      durationMs,
      time: new Date().toISOString(),
    });
    proxyLog = proxyLog.slice(-1000);
    await persist();
  }
  async function resolveProfile(
    profile: RequestProfile,
  ): Promise<{ secrets: ResolvedSecrets; proxy?: ProxyProfile }> {
    await ready;
    const proxy = pool.select(proxies, profile.url, profile.proxyId);
    return {
      proxy,
      secrets: {
        headers: profile.headerSecretId
          ? JSON.parse(await vault.get(profile.headerSecretId))
          : undefined,
        cookie: await vault.get(profile.cookieSecretId),
        body: profile.bodySecretId
          ? await vault.get(profile.bodySecretId)
          : undefined,
        proxyUrl: proxy
          ? proxyUrl(
              proxy,
              proxy.credentialId
                ? await vault.get(proxy.credentialId)
                : undefined,
            )
          : undefined,
      },
    };
  }
  async function track(
    profile: ProxyProfile | undefined,
    fn: () => Promise<HttpResult>,
  ) {
    const start = performance.now();
    try {
      const result = await fn();
      if (profile) profile[result.status < 400 ? "success" : "failure"]++;
      if (profile)
        proxyLog.push({
          id: profile.id,
          ok: result.status < 400,
          durationMs: performance.now() - start,
          time: new Date().toISOString(),
        });
      return result;
    } catch (e) {
      if (profile) {
        profile.failure++;
        proxyLog.push({
          id: profile.id,
          ok: false,
          durationMs: performance.now() - start,
          time: new Date().toISOString(),
        });
      }
      throw e;
    } finally {
      proxyLog = proxyLog.slice(-1000);
      if (profile) await persist();
    }
  }
  async function saveBody(result: HttpResult) {
    const target = await dialog.showSaveDialog({
      defaultPath: result.binary ? "response.bin" : "response.txt",
    });
    if (!target.canceled && target.filePath)
      await writeFile(
        target.filePath,
        Buffer.from(result.bodyBase64, "base64"),
      );
    return !target.canceled;
  }
  async function cacheClear() {
    await mkdir(cacheRoot, { recursive: true });
    for (const name of await readdir(cacheRoot)) {
      if (/^[a-f0-9]{64}\.cache$/.test(name)) await rm(join(cacheRoot, name));
    }
  }
  async function request(profile: RequestProfile) {
    const resolved = await resolveProfile(profile);
    const config = settings.read();
    const useCache =
      config.general.cacheDocuments &&
      profile.cache &&
      profile.method === "GET" &&
      !profile.headerSecretId &&
      !profile.cookieSecretId &&
      !profile.bodySecretId &&
      !profile.proxyId;
    const key = createHash("sha256")
      .update(JSON.stringify(profile))
      .digest("hex");
    const path = join(cacheRoot, key + ".cache");
    if (useCache) {
      try {
        const info = await stat(path);
        if (Date.now() - info.mtimeMs < config.cache.ttlSeconds * 1000) {
          const raw = JSON.parse(await readFile(path, "utf8"));
          return JSON.parse(
            (
              await (
                await import("electron")
              ).safeStorage.decryptStringAsync(Buffer.from(raw, "base64"))
            ).result,
          ) as HttpResult;
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          await rm(path, { force: true });
      }
    }
    const result = await track(resolved.proxy, () =>
      httpRequest(profile, resolved.secrets),
    );
    if (useCache) {
      await mkdir(cacheRoot, { recursive: true });
      let size = 0;
      for (const name of await readdir(cacheRoot))
        size += (await stat(join(cacheRoot, name))).size;
      if (size + result.bytes > config.cache.maxMb * 1024 * 1024)
        await cacheClear();
      const { safeStorage } = await import("electron");
      await writeFile(
        path,
        JSON.stringify(
          (
            await safeStorage.encryptStringAsync(JSON.stringify(result))
          ).toString("base64"),
        ),
      );
    }
    return result;
  }
  async function checkAll(url: string) {
    if (checking) throw new Error("Proxy checks already running");
    checking = true;
    try {
      for (const profile of proxies.filter((p) => p.enabled)) {
        const start = performance.now();
        let ok = false;
        try {
          await testProxy(
            profile,
            url,
            profile.credentialId
              ? await vault.get(profile.credentialId)
              : undefined,
          );
          ok = true;
          profile.success++;
        } catch {
          profile.failure++;
        }
        profile.lastChecked = new Date().toISOString();
        proxyLog.push({
          id: profile.id,
          ok,
          durationMs: performance.now() - start,
          time: profile.lastChecked,
        });
      }
      proxyLog = proxyLog.slice(-1000);
      await persist();
      return { proxies, log: proxyLog };
    } finally {
      checking = false;
    }
  }
  function profile(project = getProject()) {
    const s = settings.read();
    return requestProfileSchema.parse({
      connectTimeoutMs: s.defaults.connectTimeoutMs,
      readTimeoutMs: s.defaults.readTimeoutMs,
      userAgent: s.defaults.userAgent,
      encoding: s.encodings.response,
      totalTimeoutMs: project.timeoutMs,
      ...project.requestProfile,
      url: project.url,
    });
  }
  ipcMain.handle("service", async (_event, action: string, input: unknown) => {
    await ready;
    switch (action) {
      case "settings.read":
        return {
          value: settings.read(),
          sources: settings.sources(),
          defaults: defaultSettings(),
          restartRequired: [],
          notes: {
            transfer:
              "Connection configuration only; transfer adapter is not installed",
            captcha:
              "Provider configuration only; CAPTCHA adapter is not installed",
            regex: "Defaults for new rules; running rules keep their flags",
            policies:
              "manual/proxyImport/browserNames apply now. Scheduler, linked-file and dependency modules are not installed.",
          },
        };
      case "settings.write": {
        const value = settings.save(input);
        onSettings(value);
        return value;
      }
      case "settings.reset": {
        const p = input as { group?: string; key?: string };
        const value = settings.reset(p?.group, p?.key);
        onSettings(value);
        return value;
      }
      case "settings.export": {
        const target = await dialog.showSaveDialog({
          defaultPath: "udd-settings.json",
        });
        if (!target.canceled && target.filePath)
          await writeFile(
            target.filePath,
            JSON.stringify(settings.read(), null, 2),
          );
        return !target.canceled;
      }
      case "settings.import": {
        const source = await dialog.showOpenDialog({
          filters: [{ name: "Settings", extensions: ["json"] }],
          properties: ["openFile"],
        });
        if (source.canceled) return false;
        const value = settings.replace(
          JSON.parse(await readFile(source.filePaths[0], "utf8")),
        );
        onSettings(value);
        return value;
      }
      case "cache.clear":
        await cacheClear();
        return true;
      case "cache.info": {
        await mkdir(cacheRoot, { recursive: true });
        let bytes = 0;
        const files = await readdir(cacheRoot);
        for (const file of files)
          bytes += (await stat(join(cacheRoot, file))).size;
        return { files: files.length, bytes };
      }
      case "secret.list":
        return vault.list();
      case "secret.set": {
        const p = input as { id: string; value: string };
        if (typeof p?.value !== "string") throw new Error("Invalid secret");
        await vault.set(p.id, p.value);
        return true;
      }
      case "secret.delete":
        vault.remove(String(input));
        return true;
      case "proxy.list":
        return { proxies, log: proxyLog, schedule };
      case "proxy.import": {
        const p = input as { text: string; policy?: string };
        let mode = settings.read().policies.proxyImport;
        if (mode === "ask") {
          const answer = await dialog.showMessageBox({
            type: "question",
            message: "Імпорт проксі: зберегти поточні чи замінити?",
            buttons: ["Об’єднати", "Замінити", "Скасувати"],
            cancelId: 2,
          });
          if (answer.response === 2) return false;
          mode = answer.response === 0 ? "merge" : "replace";
        }
        const entries = parseProxyImport(p.text);
        const prepared = [];
        for (const entry of entries) {
          if (entry.credentials)
            await vault.set(entry.profile.credentialId, entry.credentials);
          prepared.push(entry.profile);
        }
        proxies = applyPolicy(proxies, prepared, mode);
        await persist();
        return { proxies, log: proxyLog };
      }
      case "proxy.update": {
        const updated = proxySchema.parse(input);
        const i = proxies.findIndex((p) => p.id === updated.id);
        if (i < 0) throw new Error("Proxy not found");
        proxies[i] = updated;
        await persist();
        return true;
      }
      case "proxy.delete":
        proxies = proxies.filter((p) => p.id !== input);
        await persist();
        return true;
      case "proxy.check":
        return checkAll(requestProfileSchema.parse({ url: input }).url);
      case "proxy.schedule": {
        const p = input as { url: string; seconds: number };
        if (timer) clearInterval(timer);
        if (p.seconds) {
          const url = requestProfileSchema.parse({ url: p.url }).url;
          if (p.seconds < 30 || p.seconds > 86400)
            throw new Error("Interval: 30..86400 seconds");
          timer = setInterval(() => {
            void checkAll(url).catch(() => {});
          }, p.seconds * 1000);
        }
        schedule = p.seconds
          ? { url: p.url, seconds: p.seconds }
          : { url: "", seconds: 0 };
        await persist();
        return true;
      }
      case "http.defaults":
        return profile();
      case "http.run": {
        const p = requestProfileSchema.parse(input);
        lastHttp = await request(p);
        if (p.saveResponse) await saveBody(lastHttp);
        return lastHttp;
      }
      case "http.save":
        if (!lastHttp) throw new Error("No HTTP response");
        return saveBody(lastHttp);
      case "http.parse":
        if (!lastHttp || lastHttp.binary) throw new Error("No text response");
        {
          const result = await parseSource(lastHttp.text);
          onResult(result);
          return result;
        }
      case "browser.open": {
        const p = requestProfileSchema.parse(input);
        const config = settings.read().browser;
        const resolved = await resolveProfile(p);
        const started = performance.now();
        try {
          lastBrowser = await browser.open(
            p,
            { ...config, executablePath: process.env.UDD_CHROMIUM_PATH },
            resolved.secrets,
          );
          await recordProxy(resolved.proxy, true, performance.now() - started);
        } catch (e) {
          await recordProxy(resolved.proxy, false, performance.now() - started);
          await browser.close();
          throw e;
        }
        return lastBrowser;
      }
      case "browser.act": {
        const a = browserActionSchema.parse(input);
        lastBrowser = await browser.act(
          a,
          "secretId" in a && a.secretId
            ? await vault.get(a.secretId)
            : undefined,
        );
        return lastBrowser;
      }
      case "browser.snapshot":
        lastBrowser = await browser.snapshot();
        return lastBrowser;
      case "browser.point": {
        const p = input as { x: number; y: number };
        lastBrowser = await browser.point(p.x, p.y);
        return lastBrowser;
      }
      case "browser.type":
        lastBrowser = await browser.typeText(String(input));
        return lastBrowser;
      case "browser.wheel": {
        const p = input as { x: number; y: number };
        lastBrowser = await browser.wheel(p.x, p.y);
        return lastBrowser;
      }
      case "browser.record":
        browser.record(Boolean(input));
        return true;
      case "browser.inspect":
        return browser.inspect(String(input));
      case "browser.close":
        await browser.close();
        lastBrowser = undefined;
        return true;
      case "preview.history":
        return previewHistory;
      case "browser.saveSession": {
        let id = typeof input === "string" && input ? input : "browser-session";
        let policy = settings.read().policies.browserNames;
        if (vault.list().includes(id)) {
          if (policy === "ask") {
            const answer = await dialog.showMessageBox({
              message: "Сесія з таким ім’ям вже існує",
              buttons: ["Замінити", "Нова назва", "Скасувати"],
              cancelId: 2,
            });
            if (answer.response === 2) return false;
            policy = answer.response === 0 ? "replace" : "rename";
          }
          if (policy === "keep") return id;
          if (policy === "rename") {
            const base = id;
            let n = 2;
            while (vault.list().includes(id)) id = `${base}-${n++}`;
          }
        }
        await vault.set(id, await browser.session());
        return id;
      }
      case "browser.restoreSession": {
        const p = profile();
        const resolved = await resolveProfile(p);
        lastBrowser = await browser.open(
          p,
          {
            ...settings.read().browser,
            executablePath: process.env.UDD_CHROMIUM_PATH,
          },
          resolved.secrets,
          await vault.get(
            typeof input === "string" && input ? input : "browser-session",
          ),
        );
        return lastBrowser;
      }
      case "browser.parse":
        if (!lastBrowser) throw new Error("No browser document");
        {
          const source =
            input === "json"
              ? JSON.stringify(lastBrowser.json)
              : lastBrowser.html;
          if (!source) throw new Error("No browser JSON");
          const result = await parseSource(source);
          onResult(result);
          return result;
        }
      case "browser.replay": {
        for (const action of getProject().browserActions) {
          lastBrowser = await browser.act(
            action,
            "secretId" in action && action.secretId
              ? await vault.get(action.secretId)
              : undefined,
          );
        }
        return lastBrowser ?? (await browser.snapshot());
      }
      default:
        throw new Error("Unsupported service operation");
    }
  });
  return {
    settings,
    profile,
    recordProxy,
    recordPreview: (output: string) => {
      if (settings.read().general.previewHistory) {
        previewHistory.push({
          time: new Date().toISOString(),
          before: previewHistory.at(-1)?.after ?? "",
          after: output,
        });
        previewHistory = previewHistory.slice(-50);
      }
    },
    resolveProfile,
    close: async () => {
      if (timer) clearInterval(timer);
      await browser.close();
      await persistence;
      if (settings.read().general.clearCacheOnExit) await cacheClear();
    },
  };
}
