import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { z } from "zod";
import { createSocksBridge } from "./proxy-bridge";
import {
  requestProfileSchema,
  redactUrl,
  type RequestProfile,
  type ResolvedSecrets,
} from "./request-profile";
export const browserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("goto"), value: z.string() }),
  z.object({
    type: z.enum(["click", "waitForSelector"]),
    selector: z.string().min(1),
  }),
  z.object({
    type: z.enum(["fill", "select", "press"]),
    selector: z.string().min(1),
    value: z.string().default(""),
    secretId: z.string().default(""),
  }),
  z.object({
    type: z.literal("check"),
    selector: z.string().min(1),
    checked: z.boolean().default(true),
  }),
  z.object({ type: z.literal("scroll"), x: z.number(), y: z.number() }),
  z.object({
    type: z.literal("waitForLoad"),
    state: z.enum(["load", "domcontentloaded", "networkidle"]),
  }),
  z.object({ type: z.literal("evaluate"), code: z.string().min(1) }),
]);
export type BrowserAction = z.infer<typeof browserActionSchema>;
export interface BrowserSnapshot {
  url: string;
  html: string;
  screenshot: string;
  dom: { tag: string; id: string; text: string; selector: string }[];
  actions: BrowserAction[];
  network: { method: string; url: string; status: number }[];
  log: string[];
  json?: unknown;
}
export interface BrowserOptions {
  headless: boolean;
  width: number;
  height: number;
  actionTimeoutMs: number;
  blockImages: boolean;
  executablePath?: string;
}
export class BrowserEngine {
  private bridge?: Awaited<ReturnType<typeof createSocksBridge>>;
  private actionTimeout = 10000;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private actions: BrowserAction[] = [];
  private recording = false;
  private replaying = false;
  private network: BrowserSnapshot["network"] = [];
  private log: string[] = [];
  private json: unknown;
  async open(
    input: unknown,
    options: BrowserOptions,
    secrets: ResolvedSecrets = {},
    storageState?: string,
  ) {
    await this.close();
    const p = requestProfileSchema.parse(input);
    this.actions = [];
    this.network = [];
    this.log = [];
    this.json = undefined;
    this.actionTimeout = options.actionTimeoutMs;
    let proxy:
      { server: string; username?: string; password?: string } | undefined;
    if (secrets.proxyUrl) {
      const u = new URL(secrets.proxyUrl);
      proxy = {
        server: `${u.protocol}//${u.host}`,
        username: decodeURIComponent(u.username) || undefined,
        password: decodeURIComponent(u.password) || undefined,
      };
      if (u.protocol.startsWith("socks")) {
        this.bridge = await createSocksBridge(secrets.proxyUrl);
        proxy = { server: this.bridge.server };
      }
    }
    this.browser = await chromium.launch({
      headless: options.headless,
      executablePath: options.executablePath,
      proxy,
    });
    this.context = await this.browser.newContext({
      userAgent: p.userAgent,
      viewport: { width: options.width, height: options.height },
      extraHTTPHeaders: { ...p.headers },
      ...(storageState ? { storageState: JSON.parse(storageState) } : {}),
    });
    if (secrets.cookie)
      await this.context.addCookies(
        secrets.cookie
          .split(";")
          .filter(Boolean)
          .map((v) => {
            const i = v.indexOf("=");
            return {
              name: v.slice(0, i).trim(),
              value: v.slice(i + 1).trim(),
              url: p.url,
            };
          }),
      );
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(options.actionTimeoutMs);
    this.page.setDefaultNavigationTimeout(p.totalTimeoutMs);
    let topNavigationCount = 0;
    let bytes = 0;
    await this.context.route("**/*", async (route) => {
      const request = route.request();
      let headers = await request.allHeaders();
      if (new URL(request.url()).origin === new URL(p.url).origin)
        headers = { ...headers, ...secrets.headers };
      else
        headers = Object.fromEntries(
          Object.entries(headers).filter(
            ([k]) => !/authorization|token|secret|api[-_]?key/i.test(k),
          ),
        );
      const rule = p.intercepts.find((r) => request.url().includes(r.pattern));
      if (rule?.action === "block") return route.abort();
      if (rule?.action === "mock")
        return route.fulfill({
          status: rule.status,
          body: rule.body,
          contentType: rule.contentType,
        });
      if (options.blockImages && request.resourceType() === "image")
        return route.abort();
      if (
        request.isNavigationRequest() &&
        request.frame() === this.page!.mainFrame()
      ) {
        if (
          request.redirectedFrom() &&
          (!p.followRedirects || ++topNavigationCount > p.maxRedirects)
        )
          return route.abort();
        if (
          !request.redirectedFrom() &&
          request.url() === p.url &&
          p.method !== "GET"
        )
          return route.continue({
            headers,
            method: p.method,
            postData: secrets.body ?? p.body,
          });
      }
      return route.continue({ headers });
    });
    this.page.on("response", (r) => {
      this.network.push({
        method: r.request().method(),
        url: redactUrl(r.url()),
        status: r.status(),
      });
      this.network = this.network.slice(-500);
    });
    this.page.on("requestfinished", (request) => {
      void request
        .sizes()
        .then((size) => {
          bytes += size.responseBodySize;
          if (bytes > p.maxBytes) {
            this.log.push("Browser resource budget exceeded");
            void this.close();
          }
        })
        .catch(() => {});
    });
    await this.page.exposeBinding("__uddRecord", (_source, action: unknown) => {
      if (this.recording && !this.replaying) {
        this.actions.push(browserActionSchema.parse(action));
        this.actions = this.actions.slice(-2000);
      }
    });
    await this.page.addInitScript(() => {
      const selector = (element: Element) => {
        if (element.id) return "#" + CSS.escape(element.id);
        const parts: string[] = [];
        let e: Element | null = element;
        while (e && e.tagName !== "HTML") {
          const parent: Element | null = e.parentElement;
          const index = parent
            ? [...parent.children]
                .filter((v) => v.tagName === e!.tagName)
                .indexOf(e) + 1
            : 1;
          parts.unshift(e.tagName.toLowerCase() + `:nth-of-type(${index})`);
          e = parent;
        }
        return parts.join(" > ");
      };
      const emit = (action: unknown) =>
        (
          window as unknown as { __uddRecord: (a: unknown) => Promise<void> }
        ).__uddRecord(action);
      document.addEventListener(
        "click",
        (e) => {
          if (e.target instanceof Element)
            void emit({ type: "click", selector: selector(e.target) });
        },
        true,
      );
      document.addEventListener(
        "change",
        (e) => {
          const el = e.target;
          if (el instanceof HTMLInputElement && el.type === "password") return;
          if (
            el instanceof HTMLInputElement &&
            ["checkbox", "radio"].includes(el.type)
          ) {
            void emit({
              type: "check",
              selector: selector(el),
              checked: el.checked,
            });
          } else if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement
          )
            void emit({
              type: "fill",
              selector: selector(el),
              value: el.value,
            });
          else if (el instanceof HTMLSelectElement)
            void emit({
              type: "select",
              selector: selector(el),
              value: el.value,
            });
        },
        true,
      );
      let timer: ReturnType<typeof setTimeout>;
      window.addEventListener("scroll", () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => void emit({ type: "scroll", x: scrollX, y: scrollY }),
          150,
        );
      });
    });
    try {
      const deadline = Date.now() + p.totalTimeoutMs;
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await this.page.goto(p.url, {
            waitUntil: "domcontentloaded",
            timeout: Math.max(
              1,
              Math.min(p.connectTimeoutMs, deadline - Date.now()),
            ),
          });
          if (
            response &&
            [408, 429, 500, 502, 503, 504].includes(response.status()) &&
            attempt < p.retries
          )
            throw new Error("Retryable browser response");
          break;
        } catch (error) {
          if (
            attempt >= p.retries ||
            Date.now() >= deadline ||
            (!["GET", "PUT", "DELETE"].includes(p.method) && !p.retryUnsafe)
          )
            throw error;
          this.log.push(`Browser retry ${attempt + 1}`);
          await new Promise((r) => setTimeout(r, p.backoffMs * 2 ** attempt));
        }
      }
      this.log.push(`Opened ${redactUrl(p.url)}`);
      return await this.snapshot();
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  private active() {
    if (!this.page || this.page.isClosed())
      throw new Error("Browser is not open");
    return this.page;
  }
  async act(input: unknown, secrets?: string) {
    const action = browserActionSchema.parse(input);
    const page = this.active();
    const start = performance.now();
    const watchdog = setTimeout(() => {
      void this.close();
    }, this.actionTimeout);
    this.replaying = true;
    try {
      if (action.type === "goto")
        await page.goto(
          requestProfileSchema.parse({
            url: new URL(action.value, page.url()).href,
          }).url,
          {
            waitUntil: "domcontentloaded",
          },
        );
      else if (action.type === "click")
        await page.locator(action.selector).click();
      else if (action.type === "fill")
        await page.locator(action.selector).fill(secrets ?? action.value);
      else if (action.type === "select")
        await page
          .locator(action.selector)
          .selectOption(secrets ?? action.value);
      else if (action.type === "press")
        await page.locator(action.selector).press(secrets ?? action.value);
      else if (action.type === "check")
        await page.locator(action.selector).setChecked(action.checked);
      else if (action.type === "scroll")
        await page.evaluate(({ x, y }) => window.scrollTo(x, y), action);
      else if (action.type === "waitForSelector")
        await page.locator(action.selector).waitFor({ state: "visible" });
      else if (action.type === "waitForLoad")
        await page.waitForLoadState(action.state);
      else if (action.type === "evaluate")
        this.json = await page.evaluate(action.code);
      this.log.push(
        `${action.type} completed in ${(performance.now() - start).toFixed(0)} ms`,
      );
      return await this.snapshot();
    } catch (error) {
      this.log.push(`${action.type} failed`);
      throw error;
    } finally {
      clearTimeout(watchdog);
      this.replaying = false;
    }
  }
  record(enabled: boolean) {
    this.recording = enabled;
    return this.actions;
  }
  async point(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error("Invalid coordinates");
    await this.active().mouse.click(x, y);
    return this.snapshot();
  }
  async typeText(text: string) {
    if (typeof text !== "string" || text.length > 10000)
      throw new Error("Invalid keyboard text");
    await this.active().keyboard.insertText(text);
    await this.active().keyboard.press("Tab");
    return this.snapshot();
  }
  async wheel(x: number, y: number) {
    await this.active().mouse.wheel(x, y);
    await new Promise((r) => setTimeout(r, 200));
    return this.snapshot();
  }
  async inspect(selector: string) {
    const locator = this.active().locator(selector);
    return {
      count: await locator.count(),
      elements: await locator.evaluateAll((nodes) =>
        nodes.slice(0, 100).map((n) => ({
          tag: n.tagName,
          html: n.outerHTML.slice(0, 20000),
          text: n.textContent?.slice(0, 1000),
        })),
      ),
    };
  }
  async snapshot(): Promise<BrowserSnapshot> {
    const page = this.active();
    return {
      url: redactUrl(page.url()),
      html: await page.content(),
      screenshot: (
        await page.screenshot({ type: "jpeg", quality: 65 })
      ).toString("base64"),
      dom: await page.locator("body *").evaluateAll((nodes) =>
        nodes.slice(0, 200).map((n) => ({
          tag: n.tagName,
          id: n.id,
          text: (n.textContent ?? "").slice(0, 100),
          selector: n.id ? "#" + CSS.escape(n.id) : n.tagName.toLowerCase(),
        })),
      ),
      actions: this.actions,
      network: this.network,
      log: this.log.slice(-500),
      json: this.json,
    };
  }
  async session() {
    if (!this.context) throw new Error("Browser is not open");
    return JSON.stringify(await this.context.storageState());
  }
  async close() {
    const browser = this.browser;
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
    if (browser) await browser.close();
    const bridge = this.bridge;
    this.bridge = undefined;
    await bridge?.close();
  }
}
