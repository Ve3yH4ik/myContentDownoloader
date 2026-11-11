import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
const policy = z.enum(["keep", "replace", "merge", "rename", "ask"]);
export const settingsSchema = z
  .object({
    version: z.literal(1).default(1),
    general: z
      .object({
        browserEngine: z.literal("chromium").default("chromium"),
        cacheDocuments: z.boolean().default(false),
        clearCacheOnExit: z.boolean().default(false),
        previewHistory: z.boolean().default(true),
        minimizeToTray: z.boolean().default(false),
        notifyWriteErrors: z.boolean().default(true),
        macroCompatibility: z.literal("udd-v1").default("udd-v1"),
        saveProxyReferences: z.boolean().default(true),
      })
      .strict()
      .prefault({}),
    performance: z
      .object({
        threads: z.number().int().min(1).max(8).default(1),
        maxWorkerMb: z.number().int().min(128).max(2048).default(256),
        maxQueueRows: z.number().int().min(100).max(100000).default(20000),
      })
      .strict()
      .prefault({}),
    csv: z
      .object({
        delimiter: z.enum([",", ";", "\t", "|"]).default(","),
        lineEnding: z.enum(["CRLF", "LF"]).default("CRLF"),
        bom: z.boolean().default(true),
      })
      .strict()
      .prefault({}),
    transfer: z
      .object({
        protocol: z.enum(["ftp", "ftps", "sftp"]).default("sftp"),
        host: z.string().default(""),
        port: z.number().int().min(1).max(65535).default(22),
        credentialId: z.string().default(""),
        remoteDirectory: z.string().default("/"),
        timeoutMs: z.number().int().min(1000).max(120000).default(30000),
      })
      .strict()
      .prefault({}),
    captcha: z
      .object({
        provider: z.enum(["disabled", "custom"]).default("disabled"),
        endpoint: z.union([z.literal(""), z.url()]).default(""),
        secretId: z.string().default(""),
        timeoutMs: z.number().int().min(1000).max(180000).default(60000),
      })
      .strict()
      .prefault({}),
    regex: z
      .object({
        flags: z
          .string()
          .regex(/^[gimsuyd]*$/)
          .default("g"),
        executionTimeoutMs: z.number().int().min(100).max(30000).default(5000),
      })
      .strict()
      .prefault({}),
    defaults: z
      .object({
        connectTimeoutMs: z.number().int().min(100).max(120000).default(10000),
        readTimeoutMs: z.number().int().min(100).max(120000).default(30000),
        userAgent: z.string().default("UniversalDataDownloader/0.3"),
      })
      .strict()
      .prefault({}),
    policies: z
      .object({
        manual: policy.default("replace"),
        scheduler: policy.default("keep"),
        proxyImport: policy.default("merge"),
        browserNames: policy.default("rename"),
        linkedFiles: policy.default("ask"),
        missingDependencies: policy.default("ask"),
      })
      .strict()
      .prefault({}),
    encodings: z
      .object({
        response: z
          .enum([
            "auto",
            "utf-8",
            "windows-1251",
            "windows-1252",
            "iso-8859-1",
            "utf-16le",
          ])
          .default("auto"),
        export: z.enum(["utf-8", "windows-1251", "utf-16le"]).default("utf-8"),
      })
      .strict()
      .prefault({}),
    editor: z
      .object({
        fontSize: z.number().int().min(10).max(24).default(13),
        highlight: z.boolean().default(true),
        tabSize: z.number().int().min(2).max(8).default(2),
      })
      .strict()
      .prefault({}),
    browser: z
      .object({
        headless: z.boolean().default(true),
        width: z.number().int().min(640).max(3840).default(1280),
        height: z.number().int().min(480).max(2160).default(800),
        actionTimeoutMs: z.number().int().min(100).max(120000).default(10000),
        blockImages: z.boolean().default(false),
      })
      .strict()
      .prefault({}),
    cache: z
      .object({
        maxMb: z.number().int().min(1).max(1024).default(64),
        ttlSeconds: z.number().int().min(1).max(604800).default(3600),
      })
      .strict()
      .prefault({}),
  })
  .strict();
export type AppSettings = z.infer<typeof settingsSchema>;
export const defaultSettings = () => settingsSchema.parse({});
type JsonObject = Record<string, unknown>;
export function deepMerge(base: JsonObject, patch: JsonObject): JsonObject {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("Invalid settings key");
    out[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object"
        ? deepMerge(base[key] as JsonObject, value as JsonObject)
        : value;
  }
  return out;
}
export function migrateSettings(input: unknown): AppSettings {
  if (!input || typeof input !== "object") throw new Error("Invalid settings");
  const value = { ...input } as JsonObject;
  if (value.version === 0) {
    value.performance = { threads: value.maxThreads ?? 1 };
    delete value.maxThreads;
    value.version = 1;
  }
  if (value.version !== undefined && value.version !== 1)
    throw new Error("Unsupported settings version");
  return settingsSchema.parse(deepMerge(defaultSettings(), value));
}
export class SettingsStore {
  private overrides: JsonObject = {};
  constructor(private path: string) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      this.overrides = raw.version === 0 ? migrateSettings(raw) : raw;
      this.read();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  read() {
    return migrateSettings(this.overrides);
  }
  sources() {
    const out: Record<string, string> = {};
    const walk = (value: JsonObject, prefix = "") => {
      for (const [k, v] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") walk(v as JsonObject, path);
        else out[path] = "user";
      }
    };
    walk(this.overrides);
    return out;
  }
  save(patch: unknown) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      throw new Error("Invalid settings");
    const candidate = deepMerge(this.overrides, patch as JsonObject);
    migrateSettings(candidate);
    this.overrides = candidate;
    this.persist();
    return this.read();
  }
  reset(group?: string, key?: string) {
    if (group) {
      if (!Object.hasOwn(defaultSettings(), group) || group === "version")
        throw new Error("Unknown settings group");
      if (key) {
        if (
          !Object.hasOwn(
            defaultSettings()[group as keyof AppSettings] as object,
            key,
          )
        )
          throw new Error("Unknown settings key");
        const v = this.overrides[group] as JsonObject | undefined;
        if (v) delete v[key];
      } else delete this.overrides[group];
    } else this.overrides = {};
    this.persist();
    return this.read();
  }
  replace(input: unknown) {
    const value = migrateSettings(input);
    this.overrides = value;
    this.persist();
    return value;
  }
  private persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = this.path + ".tmp";
    writeFileSync(temp, JSON.stringify(this.overrides, null, 2), "utf8");
    renameSync(temp, this.path);
  }
}
export function applyPolicy<T extends { name: string }>(
  existing: T[],
  incoming: T[],
  mode: z.infer<typeof policy>,
): T[] {
  if (mode === "ask") throw new Error("Policy requires a user decision");
  if (mode === "keep") return existing;
  if (mode === "replace") return incoming;
  const out = [...existing];
  for (const item of incoming) {
    const index = out.findIndex((v) => v.name === item.name);
    if (index < 0) out.push(item);
    else if (mode === "merge") out[index] = { ...out[index], ...item };
    else {
      let suffix = 2;
      while (out.some((v) => v.name === `${item.name} (${suffix})`)) suffix++;
      out.push({ ...item, name: `${item.name} (${suffix})` });
    }
  }
  return out;
}
