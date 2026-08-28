import { expect, test } from "@playwright/test";
import { routePinnedRuntimeResources } from "./runtime-resources.mjs";

test.beforeEach(async ({ page }) => {
  await routePinnedRuntimeResources(page);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.__consoleErrors = errors;
  await page.goto("/?test=1");
  await expect(page.locator("#setup")).toBeVisible();
  await page.locator("#su-name").fill("مستخدم تجريبي");
  await page.locator("#su-sex").selectOption("m");
  await page.locator("#su-age").fill("35");
  await page.locator("#su-ht").fill("170");
  await page.locator("#su-w").fill("85");
  await page.locator("#su-gw").fill("75");
  await page.locator("#su-act").selectOption("1.55");
  await page.locator("#su-save").click();
  await expect(page.locator("#app")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.__consoleErrors).toEqual([]);
});

async function openFoodDraft(page) {
  await page.locator("#meals-box .opt", { hasText: "أضف أكلة" }).first().click();
  const name = page.locator('#meals-box input[placeholder*="اكتب الأكل"]');
  await name.fill("طبق اختبار عام");
  return name.locator("xpath=..");
}

async function stubEstimate(page, implementation) {
  await page.evaluate((source) => {
    const original = window.firebaseBridge;
    window.__aiCalls = [];
    window.firebaseBridge = Object.freeze({
      ...original,
      estimateFood: Function("text", source),
    });
  }, implementation);
}

test("enabled release shows both AI buttons", async ({ page }) => {
  const foodForm = await openFoodDraft(page);
  await expect(foodForm.getByRole("button", { name: "🤖 احسب السعرات" })).toBeVisible();
  await page.locator("#tab-cal").click();
  await expect(page.locator("#calref-list").getByRole("button", { name: "🤖 احسب" })).toBeVisible();
});

test("declining disclosure sends and stores nothing", async ({ page }) => {
  const form = await openFoodDraft(page);
  await stubEstimate(page, "window.__aiCalls.push(text); return Promise.resolve({k:500,p:30,f:20,c:50});");
  page.once("dialog", (dialog) => dialog.dismiss());
  await form.getByRole("button", { name: "🤖 احسب السعرات" }).click();
  await expect(page.locator("#af-status")).toContainText("اكتب السعرات والماكروز");
  const result = await page.evaluate(() => ({
    calls: window.__aiCalls.length,
    hasVersion: Object.hasOwn(S.settings, "aiDisclosureVersion"),
    hasTime: Object.hasOwn(S.settings, "aiDisclosureAcceptedAt"),
  }));
  expect(result).toEqual({ calls: 0, hasVersion: false, hasTime: false });
});

test("accepting disclosure stores only consent metadata and fills an unsaved draft", async ({ page }) => {
  const form = await openFoodDraft(page);
  const beforeFoods = await page.evaluate(() => JSON.stringify(S.foods));
  await stubEstimate(page, "window.__aiCalls.push(text); return Promise.resolve({k:500,p:30,f:20,c:50});");
  page.once("dialog", (dialog) => dialog.accept());
  await form.getByRole("button", { name: "🤖 احسب السعرات" }).click();
  await expect(page.locator("#af-k")).toHaveValue("500");
  await expect(page.locator("#af-p")).toHaveValue("30");
  await expect(page.locator("#af-f")).toHaveValue("20");
  await expect(page.locator("#af-c")).toHaveValue("50");
  await expect(page.locator("#af-status")).toContainText("تقدير تقريبي");
  const result = await page.evaluate(() => ({
    calls: window.__aiCalls.length,
    version: S.settings.aiDisclosureVersion,
    time: S.settings.aiDisclosureAcceptedAt,
    foods: JSON.stringify(S.foods),
    promptStored: Object.hasOwn(S.settings, "food") || Object.hasOwn(S.settings, "prompt"),
  }));
  expect(result.calls).toBe(1);
  expect(result.version).toBe(1);
  expect(result.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(result.foods).toBe(beforeFoods);
  expect(result.promptStored).toBe(false);
});

test("AI failures stay console-clean and preserve manual entry", async ({ page }) => {
  await page.evaluate(() => {
    window.__dietTest.mutate((state) => {
      state.settings.aiDisclosureVersion = 1;
      state.settings.aiDisclosureAcceptedAt = new Date().toISOString();
    }, { touchSections: ["settings"] });
  });
  await openFoodDraft(page);
  await page.evaluate(() => {
    const original = window.firebaseBridge;
    window.__aiOutcomes = [
      { error: { code: "ai/forbidden" } },
      { error: { code: "AI/fetch-error", customErrorData: { status: 401 } } },
      { error: { code: "AI/fetch-error", customErrorData: { status: 403 } } },
      { error: { code: "AI/fetch-error", customErrorData: { status: 429 } } },
      { error: { code: "ai/network-request-failed" } },
      { value: { k: 1, p: 0, f: 0, c: 0 } },
    ];
    window.firebaseBridge = Object.freeze({
      ...original,
      estimateFood: async () => {
        const outcome = window.__aiOutcomes.shift();
        if (outcome.error) throw Object.assign(new Error("stubbed expected failure"), outcome.error);
        return outcome.value;
      },
    });
  });
  const expected = [
    "الحساب مش مفعّل",
    "التحقق من جلسة الدخول أو أمان التطبيق منجحش",
    "التحقق من أمان التطبيق منجحش",
    "حصة التقدير خلصت",
    "مفيش اتصال",
    "أرقام غير متناسقة",
  ];
  for (const copy of expected) {
    await page.getByRole("button", { name: "🤖 احسب السعرات" }).click();
    await expect(page.locator("#af-status")).toContainText(copy);
  }
  await page.locator("#af-k").fill("500");
  await page.locator("#af-p").fill("30");
  await page.locator("#af-f").fill("20");
  await page.locator("#af-c").fill("50");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator("#meals-box .opt.sel")).toContainText("طبق اختبار عام");
});
