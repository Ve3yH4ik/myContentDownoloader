import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixture, httpProxy, socksProxy } from "./fixtures/server";
import { httpRequest } from "../src/core/http";
import { requestProfileSchema } from "../src/core/request-profile";
import {
  parseProxyImport,
  ProxyPool,
  proxySchema,
  proxyUrl,
  testProxy,
} from "../src/core/proxies";
import {
  SettingsStore,
  defaultSettings,
  migrateSettings,
  applyPolicy,
} from "../src/core/settings";
import { BrowserEngine } from "../src/core/browser";
import { parseDocument } from "../src/core/engine";
import example from "../examples/products.json";
let server: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  server = await fixture();
});
afterAll(async () => {
  await server.close();
});
describe("HTTP engine integration", () => {
  it("decodes gzip with a decoded-size limit", async () => {
    expect((await httpRequest({ url: server.url + "/gzip" })).text).toContain(
      "compressed",
    );
    await expect(
      httpRequest({ url: server.url + "/gzip", maxBytes: 100 }),
    ).rejects.toThrow();
  });
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"])
    it(`${method}, headers, user agent and payload`, async () => {
      const response = await httpRequest({
        url: server.url + "/echo",
        method,
        headers: { "x-test": "ok" },
        userAgent: "UDD-test",
        body: "hello",
      });
      const data = JSON.parse(response.text);
      expect(data.method).toBe(method);
      expect(data.headers["x-test"]).toBe("ok");
      expect(data.headers["user-agent"]).toBe("UDD-test");
      expect(data.body).toBe(method === "GET" ? "" : "hello");
    });
  it("follows redirects and maintains scoped cookies without leaking them to logs", async () => {
    const result = await httpRequest({
      url: server.url + "/cookie",
      followRedirects: true,
    });
    expect(JSON.parse(result.text).headers.cookie).toBe("session=fixture");
    expect(result.redirects).toHaveLength(1);
    expect(result.log.join(" ")).not.toContain("session=");
  });
  it("inspects redirects without following and enforces redirect count", async () => {
    expect((await httpRequest({ url: server.url + "/redirect" })).status).toBe(
      302,
    );
    await expect(
      httpRequest({
        url: server.url + "/loop",
        followRedirects: true,
        maxRedirects: 1,
      }),
    ).rejects.toThrow("Redirect");
  });
  it("retries with bounded backoff", async () => {
    const result = await httpRequest({
      url: server.url + "/retry",
      retries: 2,
      backoffMs: 1,
    });
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(3);
  });
  it("returns error status and binary bytes without corrupting bodies", async () => {
    expect((await httpRequest({ url: server.url + "/error" })).status).toBe(
      418,
    );
    const binary = await httpRequest({ url: server.url + "/binary" });
    expect(binary.binary).toBe(true);
    expect(Buffer.from(binary.bodyBase64, "base64")).toEqual(
      Buffer.from([0, 255, 100, 0]),
    );
  });
  it("limits body size and connection/read/total timeouts", async () => {
    await expect(
      httpRequest({ url: server.url + "/large", maxBytes: 10 }),
    ).rejects.toThrow("size");
    await expect(
      httpRequest({
        url: server.url + "/slow",
        connectTimeoutMs: 100,
        totalTimeoutMs: 1000,
      }),
    ).rejects.toThrow("timeout");
    await expect(
      httpRequest({
        url: server.url + "/read-slow",
        readTimeoutMs: 100,
        totalTimeoutMs: 1000,
      }),
    ).rejects.toThrow("timeout");
    await expect(
      httpRequest({ url: server.url + "/slow", totalTimeoutMs: 100 }),
    ).rejects.toThrow("timeout");
  });
  it("rejects inline credentials and plaintext authentication headers/bodies", () => {
    for (const p of [
      { url: "https://user:pass@site.test" },
      { url: "https://site.test?token=abc" },
      { url: server.url, headers: { Authorization: "secret" } },
      { url: server.url, body: "password=secret" },
    ])
      expect(() => requestProfileSchema.parse(p)).toThrow();
  });
  it("uses resolved secrets only at request time and redacts response cookies", async () => {
    const result = await httpRequest(
      { url: server.url + "/echo" },
      { headers: { Authorization: "secret-value" }, cookie: "test=value" },
    );
    expect(JSON.parse(result.text).headers.authorization).toBe("secret-value");
    expect(result.log.join(" ")).not.toContain("secret-value");
  });
});
describe("proxy integration", () => {
  it("uses an HTTPS proxy with a trusted test certificate", async () => {
    const proxy = await httpProxy(false, true);
    try {
      const result = await httpRequest(
        { url: server.url + "/html" },
        {
          proxyUrl: proxy.url,
          ca: readFileSync(
            new URL("./fixtures/tls/localhost.crt", import.meta.url),
            "utf8",
          ),
        },
      );
      expect(result.status).toBe(200);
      expect(proxy.hits()).toBe(1);
    } finally {
      await proxy.close();
    }
  });
  it("uses an authenticated HTTP proxy and tests availability", async () => {
    const proxy = await httpProxy(true);
    try {
      const entry = parseProxyImport(proxy.url)[0];
      const result = await httpRequest(
        { url: server.url + "/echo" },
        { proxyUrl: proxyUrl(entry.profile, entry.credentials) },
      );
      expect(result.status).toBe(200);
      expect(
        JSON.parse(result.text).headers["proxy-authorization"],
      ).toBeUndefined();
      await testProxy(entry.profile, server.url, entry.credentials);
      expect(proxy.hits()).toBe(2);
    } finally {
      await proxy.close();
    }
  });
  for (const [version, auth] of [
    [4, false],
    [5, false],
    [5, true],
  ] as const)
    it(`SOCKS${version}, auth=${auth}`, async () => {
      const proxy = await socksProxy(version, auth);
      try {
        expect(
          (
            await httpRequest(
              { url: server.url + "/html" },
              { proxyUrl: proxy.url },
            )
          ).status,
        ).toBe(200);
        expect(proxy.hits()).toBe(1);
      } finally {
        await proxy.close();
      }
    });
  it("imports without plaintext credentials, rotates, respects bindings and rejects malformed input", () => {
    const entries = parseProxyImport(
      "http://u:p@127.0.0.1:8000\nsocks5://127.0.0.1:8001",
    );
    expect(entries[0].profile.server).not.toContain("u:p");
    expect(entries[0].credentials).toContain("password");
    const proxies = entries.map((v) => v.profile);
    const pool = new ProxyPool();
    expect(pool.select(proxies, server.url, "rotate")?.id).not.toBe(
      pool.select(proxies, server.url, "rotate")?.id,
    );
    proxies[0].origins = ["https://other.test"];
    expect(() => pool.select(proxies, server.url, proxies[0].id)).toThrow();
    expect(() => parseProxyImport("file:///oops")).toThrow();
    expect(() =>
      proxySchema.parse({ ...proxies[0], server: "https://u:p@proxy.test" }),
    ).toThrow();
  });
});
describe("application settings", () => {
  it("migrates v0 and rejects future versions, invalid types and credential fields", () => {
    expect(
      migrateSettings({ version: 0, maxThreads: 3 }).performance.threads,
    ).toBe(3);
    expect(() => migrateSettings({ version: 99 })).toThrow();
    expect(() => migrateSettings({ performance: { threads: 0 } })).toThrow();
    expect(() => migrateSettings({ transfer: { password: "raw" } })).toThrow();
  });
  it("persists settings with value sources, resets individual/group values and reloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "udd-settings-"));
    try {
      const file = join(dir, "settings.json");
      let store = new SettingsStore(file);
      store.save({ csv: { delimiter: ";" }, performance: { threads: 3 } });
      expect(store.sources()["csv.delimiter"]).toBe("user");
      expect(store.read().general).toEqual(defaultSettings().general);
      store = new SettingsStore(file);
      expect(store.read().performance.threads).toBe(3);
      store.reset("csv", "delimiter");
      expect(store.read().csv.delimiter).toBe(",");
      store.reset("performance");
      expect(store.read().performance.threads).toBe(1);
      expect(() => store.save({ captcha: { token: "secret" } })).toThrow();
      expect(readFileSync(file, "utf8")).not.toContain("secret");
      store.replace({ version: 0, maxThreads: 2 });
      expect(store.read().performance.threads).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("implements keep, replace, merge, rename and explicit ask", () => {
    const a = [{ name: "a", value: 1 }];
    const b = [{ name: "a", value: 2 }];
    expect(applyPolicy(a, b, "keep")).toEqual(a);
    expect(applyPolicy(a, b, "replace")).toEqual(b);
    expect(applyPolicy(a, b, "merge")[0].value).toBe(2);
    expect(applyPolicy(a, b, "rename")[1].name).toBe("a (2)");
    expect(() => applyPolicy(a, b, "ask")).toThrow("decision");
  });
});
describe("Chromium integration", () => {
  it("uses authenticated SOCKS through a local bridge", async () => {
    const proxy = await socksProxy(5, true);
    const engine = new BrowserEngine();
    try {
      const snap = await engine.open(
        { url: server.url + "/html" },
        {
          headless: true,
          width: 1000,
          height: 700,
          actionTimeoutMs: 5000,
          blockImages: false,
          executablePath: join(
            process.cwd(),
            "vendor",
            "browsers",
            "chromium-1254",
            "chrome-win64",
            "chrome.exe",
          ),
        },
        { proxyUrl: proxy.url },
      );
      expect(snap.html).toContain("Fixture");
      expect(proxy.hits()).toBeGreaterThan(0);
    } finally {
      await engine.close();
      await proxy.close();
    }
  }, 30000);
  const executablePath = join(
    process.cwd(),
    "vendor",
    "browsers",
    "chromium-1254",
    "chrome-win64",
    "chrome.exe",
  );
  for (const headless of [true, false])
    it(`dynamic DOM, inspector, forms, JavaScript, interception and workflow; headless=${headless}`, async () => {
      const engine = new BrowserEngine();
      try {
        await engine.open(
          {
            url: server.url + "/dynamic",
            intercepts: [
              {
                pattern: "/api",
                action: "mock",
                body: '{"value":"mocked"}',
                contentType: "application/json",
              },
            ],
          },
          {
            headless,
            width: 1000,
            height: 700,
            actionTimeoutMs: 5000,
            blockImages: false,
            executablePath,
          },
        );
        await engine.act({ type: "waitForSelector", selector: "#dynamic" });
        expect((await engine.inspect('xpath=//p[@id="dynamic"]')).count).toBe(
          1,
        );
        await engine.act({ type: "fill", selector: "#name", value: "Alice" });
        await engine.act({ type: "select", selector: "#choice", value: "B" });
        await engine.act({ type: "check", selector: "#check", checked: true });
        await engine.act({ type: "click", selector: "#submit" });
        await engine.act({
          type: "waitForSelector",
          selector: "#result:not(:empty)",
        });
        const snapshot = await engine.act({
          type: "evaluate",
          code: '({value:document.querySelector("#result").textContent,selected:document.querySelector("#choice").value})',
        });
        expect(snapshot.json).toEqual({ value: "Alice mocked", selected: "B" });
        expect(snapshot.network.some((n) => n.url.endsWith("/api"))).toBe(true);
        expect(snapshot.screenshot.length).toBeGreaterThan(100);
        const result = parseDocument(
          {
            ...example,
            url: server.url,
            boundaries: [
              {
                id: "result",
                name: "Result",
                mode: "css",
                expression: "#result",
              },
            ],
          },
          snapshot.html,
        );
        expect(result.rows[0].result).toBe("Alice mocked");
        const state = await engine.session();
        await engine.close();
        await engine.open(
          { url: server.url + "/html" },
          {
            headless,
            width: 1000,
            height: 700,
            actionTimeoutMs: 5000,
            blockImages: false,
            executablePath,
          },
          {},
          state,
        );
        expect((await engine.inspect("title")).elements[0].text).toBe(
          "Fixture",
        );
      } finally {
        await engine.close();
      }
    }, 30000);
  it("records user clicks, input and scroll without password values", async () => {
    const engine = new BrowserEngine();
    try {
      await engine.open(
        { url: server.url + "/dynamic" },
        {
          headless: true,
          width: 1000,
          height: 700,
          actionTimeoutMs: 5000,
          blockImages: false,
          executablePath,
        },
      );
      engine.record(true);
      const pos = await engine.act({
        type: "evaluate",
        code: 'JSON.stringify(["name","password","submit"].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}))',
      });
      const points = JSON.parse(pos.json as string);
      await engine.point(points[0].x, points[0].y);
      await engine.typeText("Recorded");
      await engine.point(points[1].x, points[1].y);
      await engine.typeText("TOP-SECRET");
      await engine.point(points[2].x, points[2].y);
      await engine.act({
        type: "waitForSelector",
        selector: "#result:not(:empty)",
      });
      const snap = await engine.snapshot();
      expect(
        snap.actions.some((a) => a.type === "fill" && a.value === "Recorded"),
      ).toBe(true);
      expect(JSON.stringify(snap.actions)).not.toContain("TOP-SECRET");
      expect(snap.actions.some((a) => a.type === "click")).toBe(true);
      const scrolled = await engine.wheel(0, 500);
      expect(scrolled.actions.some((a) => a.type === "scroll")).toBe(true);
    } finally {
      await engine.close();
    }
  }, 30000);
});
