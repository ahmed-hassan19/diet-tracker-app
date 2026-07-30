import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.__consoleErrors = errors;
  await page.goto("/?test=1");
  await expect(page.locator("#setup")).toBeVisible();
  await page.locator("#su-name").fill("مستخدم تجريبي");
  await page.locator("#su-age").fill("29");
  await page.locator("#su-ht").fill("186");
  await page.locator("#su-w").fill("105.5");
  await page.locator("#su-gw").fill("86");
  await page.locator("#su-act").selectOption("1.55");
  await page.locator("#su-save").click();
  await expect(page.locator("#app")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.__consoleErrors).toEqual([]);
});

test("is RTL, responsive, and persists meal totals after reload", async ({
  page,
}, testInfo) => {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const firstMeal = page.locator("#meals-box .opt").first();
  await firstMeal.click();
  await expect(firstMeal).toHaveClass(/sel/);
  const summary = await page.locator("#sumbar").innerText();
  expect(summary).not.toContain("0\nسعر");
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#meals-box .opt").first()).toHaveClass(/sel/);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  if (process.env.CAPTURE_SCREENSHOTS) {
    await page.screenshot({
      path: `docs/screenshots/${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
});

test("shows custom macro warnings and supports export/import", async ({
  page,
}) => {
  await page
    .locator("#meals-box .opt", { hasText: "أضف أكلة" })
    .first()
    .click();
  const name = page.locator('#meals-box input[placeholder*="اكتب الأكل"]');
  const form = name.locator("xpath=..");
  await name.fill("اختبار");
  const numbers = form.locator('input[type="number"]');
  await numbers.nth(0).fill("500");
  await numbers.nth(1).fill("10");
  await numbers.nth(2).fill("5");
  await numbers.nth(3).fill("5");
  await form.locator("button", { hasText: "حفظ" }).click();
  await expect(page.locator(".macro-warn")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /نسخة احتياطية/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole("button", { name: "+" }).click();
  await expect(page.locator("#water-val")).toContainText("1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#imp").setInputFiles(path);
  await expect(page.locator("#water-val")).toContainText("0");
});

test("progress tab offers a stale-target note that dismisses without changing targets", async ({
  page,
}) => {
  // setup weighed in at 105.5 kg, so tw is 105.5 and a 95 kg average moves the
  // suggestion a full rounding step down: 2300-2400 -> 2200-2300
  await page.evaluate(() => {
    const iso = (back) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    };
    const state = window.__dietTest.getState();
    const days = { ...state.days };
    [
      [0, "94.8"],
      [2, "95.0"],
      [4, "95.2"],
    ].forEach(([back, weight]) => {
      days[iso(back)] = { ...days[iso(back)], weight };
    });
    window.__dietTest.setState({ ...state, days });
  });
  await page.locator("#tab-prog").click();
  const note = page.locator("#stale-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("2200–2300");
  await note.getByRole("button", { name: "الاحتفاظ بالهدف الحالي" }).click();
  await expect(note).toBeHidden();
  const settings = await page.evaluate(
    () => window.__dietTest.getState().settings,
  );
  expect(settings.klo).toBe(2300);
  expect(settings.khi).toBe(2400);
  expect(settings.tw).toBeCloseTo(95, 5);
});

test("delete-all requires typed confirmation and clears cloud/local data", async ({
  page,
}) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") await dialog.accept();
    else if (dialog.type() === "prompt") await dialog.accept("حذف");
    else await dialog.accept();
  });
  await page.locator("#delete-all").click();
  await expect(page.locator("#login")).toBeVisible();
  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("diet_tracker_v1_"),
    ),
  );
  expect(keys).toEqual([]);
});
