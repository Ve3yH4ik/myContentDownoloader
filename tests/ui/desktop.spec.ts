import { test, expect, _electron as electron } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("desktop: download, inspect, save and reopen project", async () => {
  const html = await readFile("examples/catalog.html");
  const server = createServer((req, res) => {
    if (req.url !== "/slow") res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture address");
  const data = await mkdtemp(join(tmpdir(), "udd-ui-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${data}`] });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Майстерня даних" }),
    ).toBeVisible();
    expect(
      await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()?.items.map((item) => item.label),
      ),
    ).toEqual([
      "Файл",
      "Налаштування",
      "Сервіс",
      "Web",
      "Інтерфейс",
      "Довідка",
    ]);
    await page
      .getByLabel("URL", { exact: true })
      .fill(`http://127.0.0.1:${address.port}`);
    await page.getByRole("button", { name: "▶ Запустити" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Завершено · 2 рядків",
    );
    await expect(
      page.getByRole("cell", { name: "120.50", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Трасування", exact: true }).click();
    await expect(page.locator("pre")).toContainText("120.50 UAH");
    await page.getByRole("button", { name: "Зберегти проєкт" }).click();
    await expect(page.getByRole("status")).toContainText("Збережено версію");
    await page.getByLabel("URL", { exact: true }).fill("https://example.com");
    const projectWindow = app.waitForEvent("window");
    await page.getByRole("button", { name: "▣ Проєкти", exact: true }).click();
    const projects = await projectWindow;
    await projects.getByLabel("Збережені версії").selectOption({ index: 0 });
    await projects
      .getByRole("button", { name: "Відкрити", exact: true })
      .click();
    await expect(page.getByLabel("URL", { exact: true })).toHaveValue(
      `http://127.0.0.1:${address.port}`,
    );
    await projects.close();
    await page.getByRole("button", { name: "▶ Запустити" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Завершено · 2 рядків",
    );
    await page.getByRole("button", { name: "Таблиця", exact: true }).click();
    await page.screenshot({ path: "test-results/desktop.png" });
    await page
      .getByLabel("URL", { exact: true })
      .fill(`http://127.0.0.1:${address.port}/slow`);
    await page.getByRole("button", { name: "▶ Запустити" }).click();
    await expect(
      page.getByRole("button", { name: "■ Зупинити" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "■ Зупинити" }).click();
    await expect(page.getByRole("status")).toContainText("Run stopped");
    await expect(
      page.getByRole("button", { name: "▶ Запустити" }),
    ).toBeEnabled();
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(data, { recursive: true, force: true });
  }
});

test("separate tools: synchronized settings, templates, scanner, queue, report and persistence", async () => {
  const html = await readFile("examples/catalog.html");
  const server = createServer((req, res) => {
    if (req.url === "/links")
      res.end(
        '<a href="/a">A</a><a href="/a#duplicate">dup</a><a href="/b">B</a><a href="javascript:bad()">no</a>',
      );
    else if (req.url === "/map.xml")
      res.end(
        '<?xml version="1.0"?><urlset><url><loc>/a</loc></url><url><loc>/b</loc></url></urlset>',
      );
    else if (req.url === "/bad") {
      res.writeHead(404);
      res.end("Not found");
    } else res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture address");
  const base = `http://127.0.0.1:${address.port}`;
  const data = await mkdtemp(join(tmpdir(), "udd-windows-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${data}`] });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Майстерня даних" }),
    ).toBeVisible();
    await page.getByLabel("URL", { exact: true }).fill(base);
    const settingsEvent = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "⚙ Налаштування", exact: true })
      .click();
    const settings = await settingsEvent;
    await settings
      .getByLabel("Назва проєкту", { exact: true })
      .fill("Window integration");
    await settings.getByLabel("Тайм-аут, мс", { exact: true }).fill("5000");
    await settings
      .getByRole("button", { name: "Застосувати", exact: true })
      .click();
    await expect(page.locator(".project-name")).toHaveText(
      "Window integration",
    );
    await expect(page.locator(".stat")).toContainText([
      "HTTP GET",
      "5 с",
      "CSV",
    ]);
    await settings.close();
    await page
      .getByRole("button", { name: "▶ Запустити", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Завершено · 2 рядків",
    );
    const templateEvent = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "▤ Редактор шаблону", exact: true })
      .click();
    const template = await templateEvent;
    await template
      .getByLabel("Текст шаблону")
      .fill("[BOUNDARY:title] / [COUNT] / [INDEX_ID]");
    await template
      .getByRole("button", { name: "Попередній перегляд", exact: true })
      .click();
    await expect(template.locator(".preview-box")).toContainText(
      "Приклад каталогу / 2 / 1",
    );
    await template
      .getByRole("button", { name: "Застосувати", exact: true })
      .click();
    await expect(
      page.getByLabel("Шаблон результату", { exact: true }),
    ).toHaveValue("[BOUNDARY:title] / [COUNT] / [INDEX_ID]");
    // Opening an existing tool focuses it instead of spawning duplicates.
    const count = app.windows().length;
    await page
      .getByRole("button", { name: "▤ Редактор шаблону", exact: true })
      .click();
    expect(app.windows().length).toBe(count);
    await template.close();
    const scannerEvent = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "◎ Вебсканер", exact: true })
      .click();
    const scanner = await scannerEvent;
    await scanner.getByLabel("Адреса сканування").fill(`${base}/links`);
    await scanner
      .getByRole("button", { name: "Сканувати", exact: true })
      .click();
    await expect(
      scanner.getByRole("heading", { name: "Знайдені посилання: 2" }),
    ).toBeVisible();
    await scanner
      .getByRole("button", { name: "Додати до черги", exact: true })
      .click();
    await expect(page.getByLabel("Черга URL")).toHaveValue(
      `${base}/a\n${base}/b`,
    );
    await scanner.getByLabel("Адреса сканування").fill(`${base}/map.xml`);
    await scanner
      .getByRole("button", { name: "Сканувати", exact: true })
      .click();
    await expect(
      scanner.getByRole("heading", { name: "Знайдені посилання: 2" }),
    ).toBeVisible();
    await scanner.close();
    await page
      .getByLabel("Шаблон посилань", { exact: true })
      .fill(`${base}/page/{num}`);
    await page.getByLabel("Від", { exact: true }).fill("1");
    await page.getByLabel("До", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Згенерувати", exact: true })
      .click();
    await expect(page.getByLabel("Черга URL")).toHaveValue(
      `${base}/a\n${base}/b\n${base}/page/1\n${base}/page/2`,
    );
    await page
      .getByLabel("Черга URL")
      .fill(`${base}/a\n${base}/bad\n${base}/b`);
    await page
      .getByRole("button", { name: "▶ Обробити чергу", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Чергу завершено · 4 рядків · помилок: 1",
    );
    await expect(
      page.getByRole("cell", { name: "120.50", exact: true }),
    ).toHaveCount(2);
    const queueTemplateEvent = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "▤ Редактор шаблону", exact: true })
      .click();
    const queueTemplate = await queueTemplateEvent;
    await queueTemplate
      .getByRole("button", { name: "Попередній перегляд", exact: true })
      .click();
    await expect(queueTemplate.locator(".preview-box")).toContainText(
      "Приклад каталогу / 2 / 1",
    );
    expect(
      (await queueTemplate.locator(".preview-box").innerText()).split("\n"),
    ).toHaveLength(4);
    await queueTemplate.close();
    const reportEvent = app.waitForEvent("window");
    await page.getByRole("button", { name: "▥ Звіт", exact: true }).click();
    const report = await reportEvent;
    await expect(
      report.getByRole("cell", { name: "Помилка", exact: true }),
    ).toHaveCount(1);
    await expect(
      report.getByRole("cell", { name: "Успішно", exact: true }),
    ).toHaveCount(3);
    await report.screenshot({ path: "test-results/report-window.png" });
    await report.close();
    await page
      .getByRole("button", { name: "Зберегти проєкт", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Збережено версію");
    const versionsEvent = app.waitForEvent("window");
    await page.getByRole("button", { name: "▣ Проєкти", exact: true }).click();
    const versions = await versionsEvent;
    await page.getByRole("button", { name: "Очистити", exact: true }).click();
    await expect(page.getByLabel("Черга URL")).toHaveValue("");
    await versions.getByLabel("Збережені версії").selectOption({ index: 0 });
    await versions
      .getByRole("button", { name: "Відкрити", exact: true })
      .click();
    await expect(page.getByLabel("Черга URL")).toHaveValue(
      `${base}/a\n${base}/bad\n${base}/b`,
    );
    await expect(page.getByLabel("Шаблон результату")).toHaveValue(
      "[BOUNDARY:title] / [COUNT] / [INDEX_ID]",
    );
    await expect(page.getByLabel("Шаблон посилань")).toHaveValue(
      `${base}/page/{num}`,
    );
    await versions.close();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "test-results/workspace.png" });
    const boundaryEvent = app.waitForEvent("window");
    await page.getByRole("button", { name: "◇ Границі", exact: true }).click();
    const boundaries = await boundaryEvent;
    const config = JSON.parse(
      await boundaries.getByLabel("Конфігурація границь").inputValue(),
    );
    config[0].name = "Новий заголовок";
    await boundaries
      .getByLabel("Конфігурація границь")
      .fill(JSON.stringify(config));
    await boundaries
      .getByRole("button", { name: "Застосувати", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Увімкнути Новий заголовок" }),
    ).toBeVisible();
    await boundaries.close();
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(data, { recursive: true, force: true });
  }
});
