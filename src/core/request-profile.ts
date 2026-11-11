import { z } from "zod";
export const webUrl = z
  .string()
  .transform((v) => new URL(v).href)
  .refine((v) => {
    const u = new URL(v);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      ![...u.searchParams.keys()].some((k) =>
        /token|password|secret|api[-_]?key/i.test(k),
      )
    );
  }, "Only HTTP(S), credentials must use secret references");
export const requestProfileSchema = z
  .object({
    url: webUrl,
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    headers: z.record(z.string(), z.string()).default({}),
    cookieSecretId: z.string().default(""),
    headerSecretId: z.string().default(""),
    userAgent: z.string().default("UniversalDataDownloader/0.3"),
    body: z.string().default(""),
    bodySecretId: z.string().default(""),
    proxyId: z.string().default(""),
    connectTimeoutMs: z.number().int().min(100).max(120000).default(10000),
    readTimeoutMs: z.number().int().min(100).max(120000).default(30000),
    totalTimeoutMs: z.number().int().min(100).max(600000).default(60000),
    retries: z.number().int().min(0).max(5).default(0),
    backoffMs: z.number().int().min(0).max(10000).default(300),
    retryUnsafe: z.boolean().default(false),
    followRedirects: z.boolean().default(false),
    maxRedirects: z.number().int().min(0).max(20).default(5),
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    encoding: z
      .enum([
        "auto",
        "utf-8",
        "windows-1251",
        "windows-1252",
        "iso-8859-1",
        "utf-16le",
      ])
      .default("auto"),
    saveResponse: z.boolean().default(false),
    cache: z.boolean().default(false),
    intercepts: z
      .array(
        z.object({
          pattern: z.string().min(1),
          action: z.enum(["block", "mock"]),
          status: z.number().int().min(100).max(599).default(200),
          body: z.string().default(""),
          contentType: z.string().default("text/plain"),
        }),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const name of Object.keys(p.headers))
      if (/authorization|cookie|token|secret|api[-_]?key/i.test(name))
        ctx.addIssue({
          code: "custom",
          message: `Use encrypted header/cookie references for ${name}`,
        });
    if (/(?:password|token|secret|api_key)["'\s]*[:=]/i.test(p.body))
      ctx.addIssue({
        code: "custom",
        message: "Use bodySecretId for credential-bearing bodies",
      });
  });
export type RequestProfile = z.infer<typeof requestProfileSchema>;
export interface ResolvedSecrets {
  headers?: Record<string, string>;
  cookie?: string;
  body?: string;
  proxyUrl?: string;
  ca?: string;
}
export interface HttpResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
  text: string;
  binary: boolean;
  bytes: number;
  durationMs: number;
  attempts: number;
  redirects: string[];
  log: string[];
}
export function redactUrl(value: string) {
  try {
    const u = new URL(value);
    u.username = "";
    u.password = "";
    u.search = u.search ? "?redacted" : "";
    u.hash = "";
    return u.href;
  } catch {
    return "[invalid URL]";
  }
}
export function safeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [
      k,
      /authorization|cookie|token|secret|api[-_]?key/i.test(k)
        ? "[redacted]"
        : v,
    ]),
  );
}
