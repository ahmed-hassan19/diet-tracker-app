import { expect, test } from "@playwright/test";
import { routePinnedRuntimeResources } from "./runtime-resources.mjs";

const weights = [
  ["2026-08-24", 85], ["2026-08-25", 84], ["2026-08-31", 83],
  ["2026-09-02", 82.4], ["2026-09-14", 82],
];

async function setWeights(page, values = weights) {
  await page.evaluate(async values => {
    window.__dietTest.mutate(state => {
      state.days = Object.fromEntries(values.map(([date, weight]) => [date, { weight }]));
    });
    await window.__dietTest.flushStorage();
    showTab("prog");
  }, values);
}

test.beforeEach(async ({ page }) => {
  await routePinnedRuntimeResources(page);
  page.__consoleErrors = [];
  page.on("console", message => { if (message.type() === "error") page.__consoleErrors.push(message.text()); });
  page.on("pageerror", error => page.__consoleErrors.push(error.message));
  await page.goto("/?test=1");
  await expect(page.locator("#setup")).toBeVisible();
  await page.locator("#su-name").fill("اختبار التقدم");
  await page.locator("#su-sex").selectOption("m");
  await page.locator("#su-age").fill("35");
  await page.locator("#su-ht").fill("170");
  await page.locator("#su-w").fill("85");
  await page.locator("#su-gw").fill("75");
  await page.locator("#su-act").selectOption("1.55");
  await page.locator("#su-save").click();
  await expect(page.locator("#app")).toBeVisible();
  await setWeights(page);
});

test.afterEach(async ({ page }) => { expect(page.__consoleErrors).toEqual([]); });

test("chart shows recorded comparisons by hover, keyboard, and touch", async ({ page, isMobile }, testInfo) => {
  const point = page.locator('.weight-point[data-date="2026-09-02"]'), tip = page.getByRole("tooltip");
  if (isMobile) await point.tap();
  else {
    await point.hover();
    const bounds = await point.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 25);
  }
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("2026-09-02");
  await expect(tip).toContainText("82.4 كجم");
  await expect(tip).toContainText("التغيير من آخر تسجيل (2026-08-31): -0.60 كجم");
  await expect(tip).toContainText("فرق متوسط الأسبوع (2026-W36): -1.80 كجم");
  const weekRow = page.locator("tr").filter({ hasText: "2026-W36" });
  await expect(weekRow).toContainText("82.7");
  await expect(weekRow).toContainText("-1.80 كجم");
  const tipBounds = await tip.boundingBox(), chartBounds = await page.locator(".weight-chart").boundingBox();
  expect(tipBounds.x).toBeGreaterThanOrEqual(chartBounds.x - 1);
  expect(tipBounds.x + tipBounds.width).toBeLessThanOrEqual(chartBounds.x + chartBounds.width + 1);
  await page.locator(".weight-chart").screenshot({ path: testInfo.outputPath("progress-tooltip.png") });
  await point.focus();
  await point.press("ArrowRight");
  await expect(tip).toContainText("2026-09-14");
  await expect(tip).toContainText("فرق متوسط الأسبوع (2026-W38): —");
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await page.locator('.weight-point[data-date="2026-09-14"]').press("Home");
  await expect(tip).toContainText("التغيير من آخر تسجيل: —");
  await expect(tip).toContainText("فرق متوسط الأسبوع (2026-W35): —");
  await page.locator("#tab-day").click();
  await expect(tip).toBeHidden();
  await page.locator("#tab-prog").click();
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("chart dismisses details on pointer exit, outside tap, scrolling, and rerender", async ({ page, isMobile }) => {
  const point = page.locator('.weight-point[data-date="2026-09-02"]');
  if (isMobile) await point.tap(); else await point.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  if (isMobile) await page.locator(".legend").tap(); else await page.locator(".legend").hover();
  await expect(page.getByRole("tooltip")).toBeHidden();
  await point.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.locator(".chart-scroll").dispatchEvent("scroll");
  await expect(page.getByRole("tooltip")).toBeVisible();
  if (isMobile) await point.tap(); else await point.hover();
  await page.locator(".chart-scroll").dispatchEvent("scroll");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await point.blur();
  await point.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.evaluate(() => renderProg());
  await expect(page.getByRole("tooltip")).toBeHidden();
  expect(await page.locator(".chart-tooltip").count()).toBe(1);
});

test("empty and single-weight charts exclude projections from recorded statistics", async ({ page }) => {
  await setWeights(page, []);
  await expect(page.locator(".weight-point")).toHaveCount(0);
  await expect(page.getByRole("tooltip")).toBeHidden();
  await setWeights(page, [["2026-08-24", 85]]);
  await expect(page.locator(".weight-point")).toHaveCount(1);
  await page.locator(".weight-point").focus();
  await expect(page.getByRole("tooltip")).toContainText("التغيير من آخر تسجيل: —");
  await expect(page.getByRole("tooltip")).toContainText("فرق متوسط الأسبوع (2026-W35): —");
  await setWeights(page, [["2026-08-24", 85], ["2026-08-31", 85]]);
  await page.locator(".weight-point").last().focus();
  await expect(page.getByRole("tooltip")).toContainText("0.00 كجم");
  await expect(page.getByRole("tooltip")).not.toContainText("-0.00");
});
