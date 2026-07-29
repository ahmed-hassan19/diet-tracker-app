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

async function openAddForm(page) {
  await page
    .locator("#meals-box .opt", { hasText: "أضف أكلة" })
    .first()
    .click();
  return page.locator('#meals-box input[placeholder*="اكتب الأكل"]');
}

test("suggests saved and built-in foods, and autofills a saved match", async ({
  page,
}) => {
  const name = await openAddForm(page);
  const form = name.locator("xpath=..");
  await name.fill("فطار الاختبار");
  const numbers = form.locator('input[type="number"]');
  await numbers.nth(0).fill("410");
  await numbers.nth(1).fill("30");
  await numbers.nth(2).fill("12");
  await numbers.nth(3).fill("45");
  await form.locator("button", { hasText: "حفظ" }).click();
  await expect(page.locator("#meals-box .opt.sel")).toContainText(
    "فطار الاختبار",
  );

  const reopened = await openAddForm(page);
  await expect(
    page.locator('#fd-names option[value="فطار الاختبار"]'),
  ).toHaveCount(1);
  const builtin = await page.evaluate(() => Object.values(MEALS)[0].opts[0].t);
  expect(
    await page
      .locator("#fd-names option")
      .evaluateAll((els, t) => els.some((e) => e.value === t), builtin),
  ).toBe(true);

  await reopened.fill("فطار الاختبار");
  await expect(page.locator("#af-k")).toHaveValue("410");
  await expect(page.locator("#af-p")).toHaveValue("30");
  await expect(page.locator("#af-f")).toHaveValue("12");
  await expect(page.locator("#af-c")).toHaveValue("45");
});

test("calorie reference inputs offer name and quantity suggestions", async ({
  page,
}) => {
  await page.evaluate(() => {
    S.calref = {
      items: [{ t: "بسبوسة (قطعة ١٠٠ جم)", k: 350, p: 4, f: 12, c: 56 }],
    };
    save();
  });
  await page.locator("#tab-cal").click();
  await expect(page.locator("#calref-list")).toBeVisible();

  await expect(
    page.locator('#cr-names option[value="بسبوسة (قطعة ١٠٠ جم)"]'),
  ).toHaveCount(1);
  await expect(page.locator('#cr-qty option[value="قطعة ١٠٠ جم"]')).toHaveCount(
    1,
  );
  await expect(
    page.locator('#calref-list input[list="cr-names"]'),
  ).toBeVisible();
  await expect(page.locator('#calref-list input[list="cr-qty"]')).toBeVisible();
});
