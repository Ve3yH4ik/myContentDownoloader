import { z } from "zod";
import { randomUUID } from "node:crypto";
import { httpRequest } from "./http";
export const proxySchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    server: z.url().refine((v) => {
      const u = new URL(v);
      return (
        ["http:", "https:", "socks4:", "socks5:"].includes(u.protocol) &&
        !u.username &&
        !u.password
      );
    }, "Use a supported proxy URL without inline credentials"),
    credentialId: z.string().default(""),
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).default([]),
    success: z.number().int().min(0).default(0),
    failure: z.number().int().min(0).default(0),
    lastChecked: z.string().default(""),
  })
  .strict();
export type ProxyProfile = z.infer<typeof proxySchema>;
export function parseProxyImport(
  text: string,
): { profile: ProxyProfile; credentials?: string }[] {
  return text
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((line, index) => {
      let u: URL;
      try {
        u = new URL(line.includes("://") ? line : `http://${line}`);
      } catch {
        throw new Error(`Invalid proxy at line ${index + 1}`);
      }
      const credentials =
        u.username || u.password
          ? JSON.stringify({
              username: decodeURIComponent(u.username),
              password: decodeURIComponent(u.password),
            })
          : undefined;
      u.username = "";
      u.password = "";
      return {
        profile: proxySchema.parse({
          id: randomUUID(),
          name: u.host,
          server: u.href.replace(/\/$/, ""),
          credentialId: credentials ? randomUUID() : "",
        }),
        credentials,
      };
    });
}
export function proxyUrl(profile: ProxyProfile, credentials?: string): string {
  const url = new URL(profile.server);
  if (credentials) {
    const c = JSON.parse(credentials);
    url.username = c.username;
    url.password = c.password;
  }
  return url.href;
}
export class ProxyPool {
  private cursor = 0;
  select(
    proxies: ProxyProfile[],
    url: string,
    id: string,
  ): ProxyProfile | undefined {
    if (!id) return undefined;
    const origin = new URL(url).origin;
    const allowed = proxies.filter(
      (p) =>
        p.enabled &&
        (!p.origins.length || p.origins.includes(origin)) &&
        (id === "rotate" || p.id === id),
    );
    if (!allowed.length)
      throw new Error("No enabled proxy matches this source");
    return allowed[this.cursor++ % allowed.length];
  }
}
export async function testProxy(
  profile: ProxyProfile,
  url: string,
  credentials?: string,
) {
  const result = await httpRequest(
    {
      url,
      totalTimeoutMs: 10000,
      connectTimeoutMs: 5000,
      readTimeoutMs: 5000,
      maxBytes: 1024 * 1024,
    },
    { proxyUrl: proxyUrl(profile, credentials) },
  );
  if (result.status >= 400) throw new Error(`Proxy test HTTP ${result.status}`);
  return result.durationMs;
}
