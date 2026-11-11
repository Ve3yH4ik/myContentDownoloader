import { test, expect, _electron as electron } from "@playwright/test";
import { fixture, httpProxy } from "../fixtures/server";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HttpResult } from "../../src/core/request-profile";
test("Windows tools: settings, encrypted secrets, HTTP, proxies, browser and parsing", async () => {
  test.setTimeout(120000);
  const server = await fixture();
  const proxy = await httpProxy(true);
  const data = await mkdtemp(join(tmpdir(), "udd-services-"));
  const app = await electron.launch({
    executablePath: process.env.UDD_TEST_EXECUTABLE,
    args: [
      ...(process.env.UDD_TEST_EXECUTABLE ? [] : ["."]),
      `--user-data-dir=${data}`,
    ],
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Майстерня даних" }),
    ).toBeVisible();
    await page.getByLabel("URL", { exact: true }).fill(server.url + "/html");
    const settingsEvent = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "Параметри програми", exact: true })
      .click();
    const settings = await settingsEvent;
    await expect(settings.locator(".settings-layout nav button")).toHaveCount(
      12,
    );
    await settings
      .getByRole("button", { name: "Performance & Threads", exact: true })
      .click();
    await settings.getByLabel("threads", { exact: true }).fill("2");
    await settings
      .getByRole("button", { name: "Застосувати групу", exact: true })
      .click();
    await expect(settings.locator(".tool-status").first()).toHaveText("Готово");
    await settings
      .getByRole("button", { name: "CSV Delimiters", exact: true })
      .click();
    await settings.getByLabel("delimiter", { exact: true }).selectOption(";");
    await settings
      .getByRole("button", { name: "Застосувати групу", exact: true })
      .click();
    await expect(settings.locator(".tool-status").first()).toHaveText("Готово");
    await settings.locator(".secret-box summary").click();
    await settings.getByLabel("ID секрету").fill("headers-test");
    await settings
      .getByLabel("Значення секрету")
      .fill('{"Authorization":"LOCAL-SECRET-123"}');
    await settings
      .getByRole("button", { name: "Захистити й зберегти" })
      .click();
    await expect(settings.getByLabel("Значення секрету")).toHaveValue("");
    const root = await app.evaluate(({ app }) => app.getPath("userData"));
    const encrypted = await readFile(join(root, "secrets.dpapi.json"), "utf8");
    expect(encrypted).not.toContain("LOCAL-SECRET-123");
    await settings.close();
    const httpEvent = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "HTTP Engine", exact: true })
      .click();
    const http = await httpEvent;
    await expect(http.getByLabel("RequestProfile")).not.toHaveValue("");
    const profile = JSON.parse(
      await http.getByLabel("RequestProfile").inputValue(),
    );
    profile.url = server.url + "/echo";
    profile.method = "POST";
    profile.body = "payload";
    profile.headerSecretId = "headers-test";
    await http.getByLabel("RequestProfile").fill(JSON.stringify(profile));
    await http
      .getByRole("button", { name: "Виконати HTTP", exact: true })
      .click();
    await expect(http.locator(".tool-status").first()).toHaveText("Готово");
    await expect(http.locator(".preview-box")).toContainText(
      "LOCAL-SECRET-123",
    );
    const response = await http
      .evaluate(async () =>
        window.downloader.service<HttpResult>("http.run", {
          url: location.href,
        }),
      )
      .catch(() => undefined);
    expect(response).toBeUndefined();
    profile.url = server.url + "/html";
    profile.method = "GET";
    profile.headerSecretId = "";
    await http.getByLabel("RequestProfile").fill(JSON.stringify(profile));
    await http
      .getByRole("button", { name: "Виконати HTTP", exact: true })
      .click();
    await expect(http.locator(".tool-status").first()).toHaveText("Готово");
    await http
      .getByRole("button", { name: "Відповідь → Parsing", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: "25", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.downloader.state().then((s) => s.result?.csv),
      ),
    ).toContain(";");
    const bodyPath = join(data, "response.bin");
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, bodyPath);
    await http.evaluate(async (url) => {
      await window.downloader.service("http.run", { url });
      await window.downloader.service("http.save");
    }, server.url + "/binary");
    expect(await readFile(bodyPath)).toEqual(Buffer.from([0, 255, 100, 0]));
    await http.evaluate(async (url) => {
      await window.downloader.service("settings.write", {
        general: { cacheDocuments: true },
      });
      await window.downloader.service("http.run", { url, cache: true });
    }, server.url + "/html");
    expect(
      (
        await http.evaluate(() =>
          window.downloader.service<{ files: number }>("cache.info"),
        )
      ).files,
    ).toBe(1);
    await http.evaluate(() => window.downloader.service("cache.clear"));
    expect(
      (
        await http.evaluate(() =>
          window.downloader.service<{ files: number }>("cache.info"),
        )
      ).files,
    ).toBe(0);
    const settingsPath = join(data, "settings-export.json");
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path],
      });
    }, settingsPath);
    await http.evaluate(() => window.downloader.service("settings.export"));
    expect(await readFile(settingsPath, "utf8")).not.toContain(
      "LOCAL-SECRET-123",
    );
    await http.evaluate(() => window.downloader.service("settings.import"));
    await http.close();
    const proxyEvent = app.waitForEvent("window");
    await page.getByRole("button", { name: "Проксі", exact: true }).click();
    const proxies = await proxyEvent;
    await proxies.getByLabel("Імпорт проксі").fill(proxy.url);
    await proxies
      .getByRole("button", { name: "Імпортувати проксі", exact: true })
      .click();
    await expect(proxies.getByLabel("Імпорт проксі")).toHaveValue("");
    await proxies.getByLabel("URL перевірки проксі").fill(server.url + "/html");
    await proxies
      .getByRole("button", { name: "Перевірити всі", exact: true })
      .click();
    await expect(proxies.locator(".tool-status").first()).toHaveText("Готово");
    expect(proxy.hits()).toBeGreaterThan(0);
    await proxies.evaluate(async (url) => {
      await window.downloader.service("proxy.schedule", { url, seconds: 30 });
    }, server.url + "/html");
    expect(
      JSON.parse(await readFile(join(root, "proxy-state.json"), "utf8"))
        .schedule.seconds,
    ).toBe(30);
    await proxies.evaluate(() =>
      window.downloader.service("proxy.schedule", { url: "", seconds: 0 }),
    );
    expect(await readFile(join(root, "proxies.json"), "utf8")).not.toContain(
      "user:pass",
    );
    await proxies.close();
    await page.getByLabel("URL", { exact: true }).fill(server.url + "/dynamic");
    const browserEvent = app.waitForEvent("window");
    await page.getByRole("button", { name: "Chromium", exact: true }).click();
    const browser = await browserEvent;
    await browser
      .getByRole("button", { name: "Відкрити Chromium", exact: true })
      .click();
    await expect(browser.getByAltText("Chromium preview")).toBeVisible({
      timeout: 30000,
    });
    await browser
      .getByRole("button", { name: "DOM / CSS / XPath", exact: true })
      .click();
    await browser.getByLabel("CSS або XPath").fill('xpath=//input[@id="name"]');
    await browser.getByRole("button", { name: "Inspect", exact: true }).click();
    await expect(browser.locator(".preview-box")).toContainText('"count": 1');
    await browser
      .getByRole("button", { name: "JavaScript", exact: true })
      .click();
    await browser
      .getByLabel("JavaScript", { exact: true })
      .fill('localStorage.setItem("fixture","persisted"); ({data:"ready"})');
    await browser
      .getByRole("button", { name: "Виконати JavaScript", exact: true })
      .click();
    await expect(browser.locator(".preview-box")).toContainText("ready");
    await browser
      .getByRole("button", { name: "Зберегти сесію", exact: true })
      .click();
    await expect(browser.locator(".tool-status").first()).toHaveText("Готово");
    expect(
      await readFile(join(root, "secrets.dpapi.json"), "utf8"),
    ).not.toContain("persisted");
    await browser
      .getByRole("button", { name: "Відновити сесію", exact: true })
      .click();
    await expect(browser.locator(".tool-status").first()).toHaveText("Готово");
    await browser
      .getByLabel("JavaScript", { exact: true })
      .fill('localStorage.getItem("fixture")');
    await browser
      .getByRole("button", { name: "Виконати JavaScript", exact: true })
      .click();
    await expect(browser.locator(".preview-box")).toContainText("persisted");
    await browser
      .getByRole("button", { name: "Scenario", exact: true })
      .click();
    await browser.getByLabel("Тип браузерної дії").selectOption("fill");
    await browser
      .getByRole("button", { name: "Нова дія", exact: true })
      .click();
    await browser.getByLabel("Дія selector").fill("#name");
    await browser.getByLabel("Дія value").fill("GUI");
    await browser
      .getByRole("button", { name: "Додати дію", exact: true })
      .click();
    await expect(browser.locator(".action-row")).toHaveCount(1);
    await browser
      .getByRole("button", { name: "Виконати сценарій", exact: true })
      .click();
    await expect(browser.locator(".tool-status").first()).toHaveText("Готово");
    await browser.screenshot({ path: "test-results/browser-tools.png" });
    await browser
      .getByRole("button", { name: "Закрити браузер", exact: true })
      .click();
    await browser.close();
    const config = await page.evaluate(() =>
      window.downloader.service<{
        value: { performance: { threads: number } };
      }>("settings.read"),
    );
    expect(config.value.performance.threads).toBe(2);
  } finally {
    await app.close();
    await proxy.close();
    await server.close();
    await rm(data, { recursive: true, force: true });
  }
});
