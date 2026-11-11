import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("appearance: themes, keyboard hints, help, reduced motion and separate windows", async () => {
  const data = await mkdtemp(join(tmpdir(), "udd-design-"));
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
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const browserButton = page.getByRole("button", {
      name: "Chromium",
      exact: true,
    });
    await browserButton.hover();
    await expect(page.getByRole("tooltip")).toContainText(
      "Браузерна автоматизація",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Зберегти проєкт", exact: true })
      .focus();
    await expect(page.getByRole("tooltip")).toContainText("Ctrl+S");
    await page.keyboard.press("F1");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      "Від документа до готових даних",
    );
    await page.screenshot({ path: "test-results/design-help.png", animations:"disabled" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Зберегти проєкт", exact: true }),
    ).toBeFocused();
    await page.screenshot({ path: "test-results/design-dark.png", animations:"disabled" });
    await page
      .getByRole("button", { name: "Увімкнути світлу тему", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const settingsEvent = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "⚙ Налаштування", exact: true })
      .click();
    const settings = await settingsEvent;
    await expect(
      settings.getByRole("heading", { name: "Налаштування HTTP і проєкту" }),
    ).toBeVisible();
    await expect(settings.locator("html")).toHaveAttribute(
      "data-theme",
      "light",
    );
    await settings.screenshot({ path: "test-results/design-settings.png", animations:"disabled" });
    await settings.close();
    await page.screenshot({ path: "test-results/design-light.png", animations:"disabled" });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Майстерня даних" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page
      .getByRole("button", { name: "Увімкнути темну тему", exact: true })
      .click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".app-shell")
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 800),
    );
    await expect(
      page.getByRole("button", { name: "▶ Запустити", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/design-compact.png", animations:"disabled" });
  } finally {
    await app.close();
    await rm(data, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});
