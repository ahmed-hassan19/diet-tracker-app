import { expect, test } from "@playwright/test";

async function completeSetup(page) {
  await page.goto("/?test=1");
  await expect(page.locator("#setup")).toBeVisible();
  await page.locator("#su-name").fill("اختبار الحدود");
  await page.locator("#su-sex").selectOption("m");
  await page.locator("#su-age").fill("35");
  await page.locator("#su-ht").fill("170");
  await page.locator("#su-w").fill("85");
  await page.locator("#su-gw").fill("75");
  await page.locator("#su-act").selectOption("1.55");
  await page.locator("#su-save").click();
  await expect(page.locator("#app")).toBeVisible();
}

async function upload(page, file, expectedCopy) {
  const dialogPromise = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  await page.locator("#imp").setInputFiles(file);
  expect(await dialogPromise).toContain(expectedCopy);
}

function dateAt(index) {
  return new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
}

function notesState(base, count) {
  const days = {};
  for (let index = 0; index < count; index++) days[dateAt(index)] = { notes: "م".repeat(2000) };
  return { ...base, days };
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.__consoleErrors = errors;
  await completeSetup(page);
});

test.afterEach(async ({ page }) => {
  expect(page.__consoleErrors).toEqual([]);
});

test("renders hostile import strings literally in cards, datalists, and recovery-safe DOM", async ({ page }) => {
  const profileText = '<b id=x onclick=pwned=1>X</b>';
  const foodText = '<img src=x onerror=window.pwned=1>';
  const referenceText = '<svg onload=window.pwned=1>';
  const imported = await page.evaluate(({ profileText, foodText, referenceText }) => {
    window.pwned = 0;
    return {
      days: {
        [today()]: { b: "c0", notes: foodText, weight: 85 },
        "2026-08-24": { weight: 84.5 },
      },
      settings: { ...S.settings, name: profileText },
      foods: { b: [{ t: foodText, k: 100, p: 10, f: 2, c: 10 }] },
      calref: { items: [{ t: referenceText, k: 100, p: 10, f: 0, c: 15 }] },
      updated: 1,
    };
  }, { profileText, foodText, referenceText });
  await upload(page, {
    name: "hostile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  }, "تم الاسترجاع");

  await expect(page.locator("#who")).toContainText(profileText);
  await expect(page.locator("#meals-box .opt", { hasText: foodText })).toBeVisible();
  await expect(page.locator("#notes")).toHaveValue(foodText);
  await page.locator("#meals-box .opt", { hasText: "أضف أكلة" }).first().click();
  expect(await page.locator("datalist option").evaluateAll((options, text) => options.some((option) => option.value === text), foodText)).toBe(true);
  await page.locator("#tab-cal").click();
  await expect(page.locator("#calref-list .opt", { hasText: referenceText })).toBeVisible();
  await page.locator("#tab-prog").click();
  await expect(page.locator("#chart-box title").first()).toContainText("كجم");
  const safety = await page.evaluate(() => ({
    pwned: window.pwned,
    injectedImage: !!document.querySelector('img[src="x"]'),
    injectedId: !!document.getElementById("x"),
    eventAttributes: document.querySelectorAll("[onerror],[onload]").length,
  }));
  expect(safety).toEqual({ pwned: 0, injectedImage: false, injectedId: false, eventAttributes: 0 });
});

test("rolls back parse, UTF-8, count, 600 KiB, and 10 MiB import failures", async ({ page }) => {
  test.setTimeout(60_000);
  const original = await page.evaluate(() => JSON.stringify(S));
  await upload(page, { name: "parse.json", mimeType: "application/json", buffer: Buffer.from("{") }, "مش صالح");
  await upload(page, { name: "utf8.json", mimeType: "application/json", buffer: Buffer.from([0xc3, 0x28]) }, "مش صالح");

  const base = JSON.parse(original), tooMany = { ...base, days: {} };
  for (let index = 0; index < 1096; index++) tooMany.days[dateAt(index)] = {};
  await upload(page, { name: "count.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(tooMany)) }, "خارج الحدود");
  await upload(page, { name: "oversized.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(notesState(base, 155))) }, "٦٠٠ كيلوبايت");
  const dialogPromise = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.json", { type: "application/json" }));
    const input = document.getElementById("imp");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(await dialogPromise).toContain("١٠ ميجابايت");

  expect(await page.evaluate(() => JSON.stringify(S))).toBe(original);
});

test("accepts a durable warning-size import and regenerates every imported timestamp", async ({ page }) => {
  const base = await page.evaluate(() => JSON.parse(JSON.stringify(S)));
  const warning = notesState(base, 130);
  warning.updated = 1;
  warning.settings._ts = 1;
  for (const day of Object.values(warning.days)) day._ts = 1;
  const before = Date.now();
  await upload(page, { name: "warning.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(warning)) }, "قرب من حد المزامنة");
  const result = await page.evaluate(async () => {
    await window.__dietTest.flushStorage();
    const uid = window.firebaseBridge.currentUser().uid;
    const stored = await readStateRecord(uid);
    return {
      state: JSON.parse(JSON.stringify(S)),
      stored: JSON.parse(JSON.stringify(stored)),
      size: normalizeState(S, "cloud").canonicalBytes,
    };
  });
  expect(result.state).toEqual(result.stored);
  expect(result.size).toBeGreaterThanOrEqual(500 * 1024);
  expect(result.size).toBeLessThanOrEqual(600 * 1024);
  expect(result.state.settings._ts).toBeGreaterThanOrEqual(before);
  expect(new Set(Object.values(result.state.days).map((day) => day._ts))).toEqual(new Set([result.state.settings._ts]));
});

test("migrates verified legacy storage and serializes IndexedDB writes newest-last", async ({ page }) => {
  const legacyName = "نسخة محلية قديمة";
  await page.evaluate(async (name) => {
    await window.__dietTest.flushStorage();
    const uid = window.firebaseBridge.currentUser().uid;
    const legacy = JSON.parse(JSON.stringify(S));
    legacy.settings.name = name;
    legacy.settings.age = String(legacy.settings.age);
    legacy.foods.b=[null];
    legacy.foods.extras=[null];
    legacy.days["2026-08-22"]={b:"c0",extras:["c0"],steps:"",cardio:"",weight:"",sleep:""};
    await deleteStateRecord(uid);
    await flushStateWrites(uid);
    localStorage.setItem("diet_tracker_v1_" + uid, JSON.stringify(legacy));
    localStorage.removeItem("diet_tracker_idb_v1_" + uid);
  }, legacyName);
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#who")).toContainText(legacyName);
  const migrated = await page.evaluate(async () => {
    const uid = window.firebaseBridge.currentUser().uid;
    return {
      legacy: localStorage.getItem("diet_tracker_v1_" + uid),
      marker: localStorage.getItem("diet_tracker_idb_v1_" + uid),
      stored: await readStateRecord(uid),
      state: JSON.parse(JSON.stringify(S)),
    };
  });
  expect(migrated.legacy).toBeNull();
  expect(migrated.marker).toBe("migrated");
  expect(migrated.stored).toEqual(migrated.state);
  expect(typeof migrated.state.settings.age).toBe("number");
  expect(migrated.state.days["2026-08-22"].b).toBeNull();
  expect(migrated.state.days["2026-08-22"].extras).toEqual([]);
  for(const key of ["steps","cardio","weight","sleep"]) expect(migrated.state.days["2026-08-22"][key]).toBeUndefined();

  const latest = await page.evaluate(async () => {
    for (let value = 1; value <= 8; value++) {
      window.__dietTest.mutate((candidate) => { candidate.days[today()] = { ...(candidate.days[today()] || {}), water: value }; }, { touchDay: today() });
    }
    await window.__dietTest.flushStorage();
    return (await readStateRecord(window.firebaseBridge.currentUser().uid)).days[today()].water;
  });
  expect(latest).toBe(8);

  expect(await page.evaluate(async () => {
    const originalPut=IDBObjectStore.prototype.put;
    let abortNext=true;
    IDBObjectStore.prototype.put=function(...args){
      const request=originalPut.apply(this,args);
      if(abortNext){ abortNext=false; request.addEventListener("success",()=>this.transaction.abort(),{once:true}); }
      return request;
    };
    const uid=window.firebaseBridge.currentUser().uid;
    const rejected=await writeStateRecord(uid,S).then(()=>false,()=>true);
    IDBObjectStore.prototype.put=originalPut;
    return rejected;
  })).toBe(true);
});

test("binds an import to the session that selected the file", async ({ page }) => {
  const before=await page.evaluate(()=>JSON.stringify(S));
  page.once("dialog",dialog=>dialog.accept());
  const result=await page.evaluate(async () => {
    let release;
    const bytes=new TextEncoder().encode(JSON.stringify({days:{},settings:{name:"مينفعش"},foods:{},calref:{}}));
    const file={size:bytes.byteLength,arrayBuffer:()=>new Promise(resolve=>{ release=()=>resolve(bytes.buffer); })};
    const pending=importData({files:[file],value:"selected"});
    await Promise.resolve();
    syncGeneration++;
    release();
    await pending;
    return JSON.stringify(S);
  });
  expect(result).toBe(before);
});

test("deleting custom catalog entries clears every historical reference", async ({ page }) => {
  await page.evaluate(() => {
    const state=JSON.parse(JSON.stringify(S));
    state.foods={b:[{t:"وجبة مخصصة",k:100,p:10,f:4,c:6}],extras:[{t:"إضافة مخصصة",k:100,p:10,f:4,c:6}]};
    state.days={"2026-08-23":{b:"c0",extras:["c0"]},"2026-08-24":{b:"c0",extras:["c0"]}};
    window.__dietTest.setState(state);
  });
  page.once("dialog",dialog=>dialog.accept());
  await page.evaluate(()=>delFood("b",0));
  page.once("dialog",dialog=>dialog.accept());
  await page.evaluate(()=>delExtra(0));
  const state=await page.evaluate(()=>JSON.parse(JSON.stringify(S)));
  for(const day of Object.values(state.days)){
    expect(day.b).toBeNull();
    expect(day.extras).toEqual([]);
  }
  expect(state.foods.b[0]).toBeNull();
  expect(state.foods.extras[0]).toBeNull();
});

test("keeps memory and recovery available through IndexedDB quota, corruption, and cache loss", async ({ page }) => {
  await page.evaluate(async () => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException("quota", "QuotaExceededError"); };
    window.__dietTest.mutate((candidate) => { candidate.days[today()] = { ...(candidate.days[today()] || {}), water: 7 }; }, { touchDay: today() });
    await window.__dietTest.flushStorage();
    IDBObjectStore.prototype.put = originalPut;
  });
  expect(await page.evaluate(() => S.days[today()].water)).toBe(7);
  await expect(page.locator("#storage-note")).toContainText("الحفظ على الجهاز مش متاح");
  await expect(page.locator("#storage-note")).toBeVisible();

  await page.evaluate(async () => {
    const uid = window.firebaseBridge.currentUser().uid;
    const db = await openStateDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("states", "readwrite");
      tx.objectStore("states").put({ bad: true }, uid);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator("#storage-note")).toBeVisible();
  await expect(page.locator("#storage-note")).toContainText("نزّل نسخة احتياطية");

  await page.evaluate(async () => {
    const uid = window.firebaseBridge.currentUser().uid;
    await deleteStateRecord(uid);
    await flushStateWrites(uid);
    localStorage.setItem("diet_tracker_idb_v1_" + uid, "migrated");
  });
  await page.reload();
  await expect(page.locator("#storage-note")).toBeVisible();
});

test("keeps cloud recovery and export usable when app IndexedDB access is denied", async ({ page }) => {
  await page.evaluate(() => {
    const uid = window.firebaseBridge.currentUser().uid;
    localStorage.setItem("diet_tracker_v1_" + uid, JSON.stringify(S));
  });
  await page.addInitScript(() => {
    const nativeOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === "diet_tracker") throw new DOMException("denied", "SecurityError");
      return nativeOpen.call(this, name, ...args);
    };
  });
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#storage-note")).toBeVisible();
  await expect(page.locator("#storage-note")).toContainText("بياناتك الحالية لسه في الذاكرة والسحابة");
  expect(await page.evaluate(async () => {
    const uid = window.firebaseBridge.currentUser().uid;
    const membership = await window.firebaseBridge.readMembership(uid);
    return { signedIn: !!window.firebaseBridge.currentUser(), membershipExists: membership.exists, legacyRetained: !!localStorage.getItem("diet_tracker_v1_" + uid) };
  })).toEqual({ signedIn: true, membershipExists: false, legacyRetained: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /نسخة احتياطية/ }).click();
  expect((await downloadPromise).suggestedFilename()).toContain("diet-tracker-backup");
});

test("quarantines malformed remote state without exposing accessors or scheduling writes", async ({ page }) => {
  let cloudWrites = 0;
  page.on("request", (request) => {
    if (request.url().includes("documents:commit")) cloudWrites++;
  });
  const before = await page.evaluate(() => JSON.stringify(S));
  const accepted = await page.evaluate(() => mergeRemote({
    days: {}, settings: {}, foods: {}, calref: {}, updated: Date.now(), unknown: "<img src=x onerror=pwned=1>",
  }));
  expect(accepted).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(S))).toBe(before);
  await expect(page.locator("#cloud-recovery")).toBeVisible();
  await expect(page.locator("#cloud-recovery-export")).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#cloud-recovery-export").click();
  expect((await downloadPromise).suggestedFilename()).toContain("cloud-recovery");

  const accessor = await page.evaluate(() => {
    window.pwned = 0;
    const raw = { days: {}, settings: {}, foods: {}, calref: {}, updated: Date.now() };
    Object.defineProperty(raw, "trap", { enumerable: true, get() { window.pwned++; return "secret"; } });
    const result = mergeRemote(raw);
    return { result, pwned: window.pwned };
  });
  expect(accessor).toEqual({ result: false, pwned: 0 });
  await expect(page.locator("#cloud-recovery-export")).toBeDisabled();
  await page.evaluate(() => window.__dietTest.mutate((candidate) => { candidate.days[today()] = { water: 3 }; }, { touchDay: today() }));
  await page.waitForTimeout(1500);
  expect(cloudWrites).toBe(0);

  expect(await page.evaluate(() => {
    let scheduled=0;
    schedulePush=()=>{ scheduled++; };
    mergeRemote({days:S.days,settings:S.settings,foods:S.foods,calref:S.calref,updated:Date.now()});
    return scheduled;
  })).toBe(1);
});

test("never recreates cloud data when browser cleanup fails after deletion", async ({ page }) => {
  const messages=[];
  page.on("dialog",async dialog=>{
    if(dialog.type()==="confirm") await dialog.accept();
    else if(dialog.type()==="prompt") await dialog.accept("حذف");
    else{ messages.push(dialog.message()); await dialog.accept(); }
  });
  const resultPromise=page.evaluate(async () => {
    const originalDelete=IDBObjectStore.prototype.delete;
    let writes=0;
    window.firebaseBridge.writeTracker=async()=>{ writes++; };
    IDBObjectStore.prototype.delete=function(){ throw new DOMException("denied","SecurityError"); };
    await deleteAllData();
    IDBObjectStore.prototype.delete=originalDelete;
    await new Promise(resolve=>setTimeout(resolve,1500));
    return {writes,key:KEY,state:S,ref:FB.ref};
  });
  const result=await resultPromise;
  expect(result).toEqual({writes:0,key:null,state:null,ref:null});
  await expect(page.locator("#login")).toBeVisible();
  expect(messages.join(" ")).toContain("مش هترجع تترفع");
});

test("serves CSP and security headers on both emulator origins and rewritten paths", async ({ request }) => {
  for (const origin of ["http://127.0.0.1:5005", "http://127.0.0.1:5010"]) {
    for (const pathname of ["/", "/index.html", "/data.js", "/privacy.html", "/trust-missing.js"]) {
      const response = await request.get(origin + pathname);
      expect(response.status()).toBe(200);
      const headers = response.headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("no-referrer");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["content-security-policy"]).toContain("default-src 'none'");
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
      expect(headers["cache-control"]).toContain("no-store");
    }
  }
});
