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

test("tracks both Nitro-Tech rotations with exact persistent totals", async ({
  page,
}) => {
  const meal = (text) => page.locator("#meals-box .opt", { hasText: text });
  const summaryValues = page.locator("#sumbar .v");
  const expectTotals = async ({ k, p, f, c }) => {
    await expect(summaryValues.nth(0)).toHaveText(String(k));
    await expect(summaryValues.nth(1)).toHaveText(`${p} جم`);
    await expect(summaryValues.nth(2)).toHaveText(`${f} جم`);
    await expect(summaryValues.nth(3)).toHaveText(`${c} جم`);
  };

  await meal("٧ ملاعق فول + ٣ بيضات مسلوقة").click();
  await meal("كوب لبن قليل الدسم (٢٥٠ مل) + ٢٥ جم فول سوداني").click();
  await meal("٢٠٠ جم صدور فراخ مشوية + ٣٠٠ جم رز").click();
  const waterNitro = meal("Nitro-Tech (٤٤ جم) بالمياه + موزة");
  await waterNitro.click();
  await meal("٢٥٠ جم زبادي يوناني عالي البروتين + ٣٠ جم لوز").click();
  await expectTotals({ k: 2307, p: 184, f: 75.5, c: 224 });

  const beforeWorkout = await page.evaluate(() =>
    window.__dietTest.totals(day()),
  );
  await page.locator("#workout-chips .chip", { hasText: "Push" }).click();
  expect(await page.evaluate(() => window.__dietTest.totals(day()))).toEqual(
    beforeWorkout,
  );
  await page.locator("#workout-chips .chip", { hasText: "راحة" }).click();
  expect(await page.evaluate(() => window.__dietTest.totals(day()))).toEqual(
    beforeWorkout,
  );

  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(waterNitro).toHaveClass(/sel/);
  await expectTotals({ k: 2307, p: 184, f: 75.5, c: 224 });

  await meal("٣ بيضات + ٣ توست أسمر + خيار وطماطم").click();
  await meal("علبة تونة مصفاة + ٢٥٠ جم بطاطس").click();
  const milkNitro = meal("Nitro-Tech (٤٤ جم) + ٢٥٠ مل لبن قليل الدسم");
  await milkNitro.click();
  await expectTotals({ k: 2301, p: 186, f: 65.5, c: 242 });

  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(milkNitro).toHaveClass(/sel/);
  await expectTotals({ k: 2301, p: 186, f: 65.5, c: 242 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.locator("#tab-plan").click();
  const templates = page.locator(".card", {
    has: page.getByRole("heading", { name: /القوالب اليومية وNitro-Tech/ }),
  });
  await expect(templates.getByRole("table")).toHaveCount(3);
  await expect(templates).toContainText("2307");
  await expect(templates).toContainText("2301");
  await expect(templates).toContainText("2286");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("states exact workout timing and shows only the planned powder scoop", async ({
  page,
}) => {
  const meals = page.locator("#meals-box");
  await expect(
    meals.getByRole("heading", {
      name: "🍌 وجبة اختيارية قبل التمرين بـ٦٠–١٢٠ دقيقة",
    }),
  ).toBeVisible();
  await expect(meals).toContainText(
    "كلها قبل بداية التمرين بـ٦٠–١٢٠ دقيقة؛ دي مش وجبة بعد التمرين",
  );
  await expect(
    meals.getByRole("heading", {
      name: "🥤 سكوب Nitro-Tech اليومي الوحيد",
    }),
  ).toBeVisible();
  await expect(meals).toContainText(
    "بعد نهاية التمرين بـ٠–١٢٠ دقيقة (٦٠ دقيقة موعد عملي)",
  );

  const legacyWhey = meals.locator(".opt", {
    hasText: "سكوب واي بروتين بالمياه + موزة",
  });
  await expect(legacyWhey).toHaveCount(0);

  await page.evaluate(() => {
    day().pw = 0;
    renderDay();
  });
  await expect(legacyWhey).toContainText("اختيار محفوظ قديم");
  await expect(page.locator("#sumbar .v").nth(0)).toHaveText("222");
  await legacyWhey.click();
  await expect(legacyWhey).toHaveCount(0);
  await expect(page.locator("#sumbar .v").nth(0)).toHaveText("0");

  await page.locator("#tab-plan").click();
  await expect(page.locator("#pg-plan")).not.toContainText(
    "سكوب واي بروتين بالمياه + موزة",
  );
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

test("change-from-start measures from the declared start weight, not the first log", async ({
  page,
}) => {
  // setup declared sw = 105.5; a single weigh-in is the case the old >=2 guard zeroed
  await page.evaluate(() => {
    const d = new Date();
    const iso =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    const state = window.__dietTest.getState();
    const days = { ...state.days, [iso]: { ...state.days[iso], weight: "99.6" } };
    window.__dietTest.setState({ ...state, days });
  });
  await page.locator("#tab-prog").click();
  const stat = page.locator(".stat", { hasText: "التغيير من البداية" });
  await expect(stat.locator(".v")).toHaveText("−5.9");
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
