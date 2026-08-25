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

test("shows the quota fallback copy while local tracking stays available", async ({
  page,
}) => {
  await page.evaluate(() => window.__dietTest.setGate("quota"));
  const note = page.locator("#gate-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("حصة السحابة خلصت دلوقتي");
  await expect(note).toContainText("التسجيل على جهازك شغال عادي");
  await expect(page.locator("#app")).toBeVisible();
});

test("modular Firebase bridge is narrow and AI-disabled calls stop before network", async ({ page }) => {
  let aiOrMembershipRequests = 0;
  await page.route(/firebasevertexai|generativelanguage|betaMembers/, async (route) => {
    aiOrMembershipRequests++;
    await route.abort();
  });
  const result = await page.evaluate(async () => {
    const bridge = window.firebaseBridge;
    const keys = Object.keys(bridge).sort();
    let code = "";
    try { await bridge.estimateFood("تفاحة"); } catch (error) { code = error.code; }
    return { code, frozen: Object.isFrozen(bridge), keys };
  });
  expect(result).toEqual({
    code: "ai/disabled",
    frozen: true,
    keys: [
      "currentUser", "deleteTracker", "estimateFood", "listenTracker",
      "observeAuth", "readMembership", "signInForTest", "signInGoogle",
      "signOut", "writeTracker",
    ],
  });
  expect(aiOrMembershipRequests).toBe(0);
});

test("is RTL, responsive, and persists meal totals after reload", async ({
  page,
}) => {
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
});

test("renders the runtime version and hosted-install resources", async ({ page, request }) => {
  await expect(page.locator("#app-version")).toHaveText("v3.9.0");
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute("href", "/manifest.webmanifest");
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ lang: "ar", dir: "rtl", id: "/", start_url: "/", scope: "/", display: "standalone" });
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  await page.locator("#install summary").click();
  await expect(page.locator("#install")).toContainText("فتح كتطبيق ويب");
  await expect(page.locator("#install")).toContainText("التشغيل من غير إنترنت مش مدعوم");
});

test("shows exactly three approximate core examples with exact totals and responsive RTL layout", async ({ page }) => {
  await page.locator("#tab-examples").click();
  const cards = page.locator("#pg-examples .example-day");
  await expect(cards).toHaveCount(3);
  await expect(page.locator("#pg-examples")).toContainText("أمثلة تقريبية");
  await expect(page.locator("#pg-examples")).toContainText("مش روشتة ولا ضمان");
  await expect(page.locator("#pg-examples")).not.toContainText("Nitro-Tech");
  const expected = await page.evaluate(() => rankedExampleDays(T()));
  for (let i = 0; i < expected.length; i++) {
    const card = cards.nth(i);
    await expect(card).toHaveAttribute("data-signature", expected[i].signature);
    const values = card.locator(".summary .v");
    await expect(values.nth(0)).toHaveText(String(expected[i].total.k));
    await expect(values.nth(1)).toHaveText(`${expected[i].total.p} جم`);
    await expect(values.nth(2)).toHaveText(`${expected[i].total.f} جم`);
    await expect(values.nth(3)).toHaveText(`${expected[i].total.c} جم`);
    await expect(card.locator("li")).toHaveCount(4);
  }
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("reranks examples immediately after remote and imported target changes", async ({ page }) => {
  await page.locator("#tab-examples").click();
  const first = page.locator("#pg-examples .example-day").first();
  const initial = await first.getAttribute("data-signature");
  await page.evaluate(() => {
    mergeRemote({
      days: {},
      settings: { ...S.settings, klo: 1450, khi: 1550, plo: 90, phi: 100, _ts: (S.settings._ts || 0) + 1 },
    });
  });
  const remote = await first.getAttribute("data-signature");
  expect(remote).not.toBe(initial);
  const imported = await page.evaluate(() => ({
    ...S,
    days: S.days,
    settings: { ...S.settings, klo: 2500, khi: 2600, plo: 200, phi: 220, _ts: Date.now() + 1000 },
  }));
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#imp").setInputFiles({
    name: "targets.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(first).not.toHaveAttribute("data-signature", remote);
  const expected = await page.evaluate(() => rankedExampleDays(T())[0]);
  await expect(first).toHaveAttribute("data-signature", expected.signature);
});

test("legacy product choices stay hidden except for the selected saved index", async ({
  page,
}) => {
  const meals = page.locator("#meals-box");
  const productRows = meals.locator(".opt", { hasText: "Nitro-Tech" });
  const summaryValues = page.locator("#sumbar .v");
  await expect(productRows).toHaveCount(0);
  await expect(page.locator("#tab-plan")).toHaveCount(0);

  await page.evaluate(() => {
    day().nt = 0;
    save();
    renderDay();
  });
  await expect(productRows).toHaveCount(1);
  await expect(productRows).toContainText("بالمياه + موزة");
  await expect(productRows).not.toContainText("٢٥٠ مل لبن");
  await expect(productRows).toContainText("اختيار محفوظ قديم");
  await expect(summaryValues.nth(0)).toHaveText("246");
  await productRows.click();
  await expect(productRows).toHaveCount(0);
  await expect(summaryValues.nth(0)).toHaveText("0");

  await page.evaluate(() => {
    day().nt = 1;
    save();
    renderDay();
  });
  await expect(productRows).toHaveCount(1);
  await expect(productRows).toContainText("٢٥٠ مل لبن قليل الدسم");
  await expect(productRows).not.toContainText("بالمياه + موزة");
  await expect(summaryValues.nth(0)).toHaveText("270");

  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(productRows).toHaveCount(1);
  await expect(productRows).toContainText("٢٥٠ مل لبن قليل الدسم");
  await expect(summaryValues.nth(0)).toHaveText("270");
  await productRows.click();
  await expect(productRows).toHaveCount(0);
});

test("legacy generic whey stays hidden unless it was saved", async ({
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
      [0, "77.8"],
      [2, "78.0"],
      [4, "78.2"],
    ].forEach(([back, weight]) => {
      days[iso(back)] = { ...days[iso(back)], weight };
    });
    window.__dietTest.setState({ ...state, days });
  });
  await page.locator("#tab-prog").click();
  const note = page.locator("#stale-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("1900–2000");
  await note.getByRole("button", { name: "الاحتفاظ بالهدف الحالي" }).click();
  await expect(note).toBeHidden();
  const settings = await page.evaluate(
    () => window.__dietTest.getState().settings,
  );
  expect(settings.klo).toBe(1950);
  expect(settings.khi).toBe(2050);
  expect(settings.tw).toBeCloseTo(78, 5);
});

test("change-from-start measures from the declared start weight, not the first log", async ({
  page,
}) => {
  await page.evaluate(() => {
    const d = new Date();
    const iso =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    const state = window.__dietTest.getState();
    const days = { ...state.days, [iso]: { ...state.days[iso], weight: "80" } };
    window.__dietTest.setState({ ...state, days });
  });
  await page.locator("#tab-prog").click();
  const stat = page.locator(".stat", { hasText: "التغيير من البداية" });
  await expect(stat.locator(".v")).toHaveText("−5.0");
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
