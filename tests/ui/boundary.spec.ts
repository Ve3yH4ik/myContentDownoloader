import { test, expect, _electron as electron } from "@playwright/test";
import { fixture } from "../fixtures/server";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("boundary workbench: F4/code selection, form, nested preview, ordered processing and save", async () => {
  test.setTimeout(120000);
  const server = await fixture();
  const data = await mkdtemp(join(tmpdir(), "udd-boundary-"));
  const app = await electron.launch({
    executablePath: process.env.UDD_TEST_EXECUTABLE,
    args: [
      ...(process.env.UDD_TEST_EXECUTABLE ? [] : ["."]),
      `--user-data-dir=${data}`,
    ],
  });
  try {
    const main = await app.firstWindow();
    await expect(
      main.getByRole("heading", { name: "Майстерня даних" }),
    ).toBeVisible();
    await main
      .getByLabel("URL", { exact: true })
      .fill(server.url + "/boundary");
    await main
      .getByLabel("Черга URL", { exact: true })
      .fill(server.url + "/html\n" + server.url + "/boundary?second=1");
    await main
      .getByRole("button", { name: "Застосувати список", exact: true })
      .click();
    const windowEvent = app.waitForEvent("window");
    await main.getByRole("button", { name: "◇ Границі", exact: true }).click();
    const editor = await windowEvent;
    await expect(editor.getByLabel("Активна границя")).toBeVisible();
    await editor
      .getByRole("button", { name: "Завантажити сторінку", exact: true })
      .click();
    const image = editor.getByAltText("Сторінка для налаштування границь");
    await expect(image).toBeVisible({ timeout: 30000 });
    await expect(editor.locator(".boundary-urls button")).toHaveCount(3);
    const rectangle = await editor.evaluate(async () => {
      const result = await window.downloader.service<{
        elements: {
          rect: { x: number; y: number; width: number; height: number };
        }[];
      }>("boundary.inspect", "h1");
      return result.elements[0].rect;
    });
    const dimensions = await image.evaluate((img) => ({
      width: (img as HTMLImageElement).naturalWidth,
      height: (img as HTMLImageElement).naturalHeight,
    }));
    const box = await image.boundingBox();
    if (!box) throw new Error("No page preview");
    await editor.mouse.move(
      box.x + ((rectangle.x + 10) * box.width) / dimensions.width,
      box.y + ((rectangle.y + 10) * box.height) / dimensions.height,
    );
    await editor.keyboard.press("F4");
    await expect(editor.locator(".boundary-selection code")).toBeVisible();
    const selected = await editor
      .getByLabel("HTML документа")
      .evaluate((el) => {
        const t = el as HTMLTextAreaElement;
        return t.value.slice(t.selectionStart, t.selectionEnd);
      });
    expect(selected).toContain("Каталог товарів");
    expect(selected.startsWith("<h1")).toBe(true);
    await editor
      .getByRole("button", { name: "Використати CSS", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Перевірити границю", exact: true })
      .click();
    await expect(
      editor.locator(".boundary-result-value").first(),
    ).toContainText("Каталог товарів");
    // Native Ctrl+click at the source caret: the off-screen element must scroll into view.
    const point = await editor.getByLabel("HTML документа").evaluate((node) => {
      const el = node as HTMLTextAreaElement;
      const offset = el.value.indexOf('id="below-fold"') + 6;
      const prefix = el.value.slice(0, offset);
      const lines = prefix.split("\n");
      const style = getComputedStyle(el);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.font = style.fontSize + " " + style.fontFamily;
      const width = ctx.measureText(lines.at(-1)!).width;
      el.scrollLeft = Math.max(0, width - el.clientWidth / 2);
      el.scrollTop = Math.max(0, (lines.length - 1) * 19 - el.clientHeight / 2);
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + parseFloat(style.paddingLeft) + width - el.scrollLeft,
        y:
          rect.top +
          parseFloat(style.paddingTop) +
          (lines.length - 1) * 19 -
          el.scrollTop +
          9,
      };
    });
    await editor.keyboard.down("Control");
    await editor.mouse.click(point.x, point.y);
    await editor.keyboard.up("Control");
    await expect(editor.locator(".boundary-selection code")).toHaveText(
      "#below-fold",
    );
    await expect(editor.locator(".picked-outline")).toBeVisible();
    await editor
      .getByRole("button", { name: "Межі з елемента", exact: true })
      .click();
    await editor.getByRole("button", { name: "Границя", exact: true }).click();
    await expect(
      editor.getByLabel("Початкова границя", { exact: true }),
    ).toHaveValue('<h2 id="below-fold">');
    await expect(
      editor.getByLabel("Кінцева границя", { exact: true }),
    ).toHaveValue("</h2>");
    await editor.getByLabel("Активна границя").selectOption("products");
    await editor.getByLabel("Режим границі").selectOption("css");
    await editor.getByLabel("Вираз границі").fill(".product");
    await editor.getByLabel("Активна границя").selectOption("name");
    await editor.getByLabel("Режим границі").selectOption("css");
    await editor.getByLabel("Вираз границі").fill("h2");
    await editor
      .getByRole("button", { name: "Перевірити границю", exact: true })
      .click();
    await expect(editor.locator(".boundary-result-value")).toHaveCount(2);
    await expect(editor.locator(".boundary-result-value").nth(0)).toContainText(
      "Комплект фільтрів",
    );
    await expect(editor.locator(".boundary-result-value").nth(1)).toContainText(
      "Гальмівні колодки",
    );
    await editor.getByLabel("Активна границя").selectOption("price");
    await editor.getByRole("button", { name: "Границя", exact: true }).click();
    await editor.getByLabel("Режим границі").selectOption("css");
    await editor.getByLabel("Вираз границі").fill(".price");
    await editor.getByRole("button", { name: "Обробка", exact: true }).click();
    await editor.getByLabel("Нова операція").selectOption("prepend");
    await editor
      .getByRole("button", { name: "Додати операцію", exact: true })
      .click();
    await editor.getByLabel("Операція 2: value").fill("UAH:");
    await editor
      .getByRole("button", { name: "Перевірити границю", exact: true })
      .click();
    await expect(
      editor.locator(".boundary-result-value").first(),
    ).toContainText("UAH:120.50");
    await editor.getByRole("button", { name: "Обробка", exact: true }).click();
    await editor
      .getByRole("button", { name: "Операція 2 угору", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Перевірити границю", exact: true })
      .click();
    await expect(
      editor.locator(".boundary-result-value").first(),
    ).toContainText("120.50");
    await expect(
      editor.locator(".boundary-result-value").first(),
    ).not.toContainText("UAH:");
    await editor
      .getByRole("button", { name: "Застосувати й зберегти", exact: true })
      .click();
    await expect(editor.locator(".boundary-status")).toContainText("збережено");
    await editor.getByRole("button", { name: "Границя", exact: true }).click();
    await editor
      .getByRole("button", { name: "Знайти CSS на сторінці", exact: true })
      .click();
    await expect(editor.locator(".boundary-status")).toContainText("Знайдено");
    await editor.screenshot({
      path: "test-results/boundary-workbench.png",
      animations: "disabled",
    });
    await editor
      .getByRole("button", { name: "JSON границь", exact: true })
      .click();
    const jsonEditor = editor.getByLabel("Конфігурація границь");
    const pendingJson = (await jsonEditor.inputValue()) + " ";
    await jsonEditor.fill(pendingJson);
    await expect(editor.getByLabel("Активна границя")).toBeDisabled();
    await expect(
      editor.getByRole("button", { name: "+ Звичайна", exact: true }),
    ).toBeDisabled();
    await main
      .locator(".tree-row button")
      .filter({ hasText: "Назва товару" })
      .click();
    await expect(jsonEditor).toHaveValue(pendingJson);
    await expect(editor.locator(".boundary-status")).toContainText(
      "незбережений JSON",
    );
    await editor
      .getByRole("button", { name: "Оновити дерево", exact: true })
      .click();
    await expect(editor.getByLabel("Активна границя")).toHaveValue("price");
    const project = await main.evaluate(() =>
      window.downloader.state().then((s) => s.project),
    );
    expect(project.boundaries.find((b) => b.id === "products")?.mode).toBe(
      "css",
    );
    await editor.close();
    const reopen = app.waitForEvent("window");
    await main
      .locator(".tree-row button")
      .filter({ hasText: "Назва товару" })
      .click();
    const reopened = await reopen;
    await expect(reopened.getByLabel("Активна границя")).toHaveValue("name");
    await reopened.close();
  } finally {
    await app.close();
    await server.close();
    await rm(data, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});
