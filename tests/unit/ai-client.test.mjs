import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function harness() {
  let saves = 0;
  let confirms = 0;
  const context = {
    console,
    window: { AI_ENABLED: false },
    navigator: { onLine: true },
    S: { settings: {} },
    save() { saves++; },
    confirm() { confirms++; return true; },
  };
  vm.createContext(context);
  vm.runInContext(
    `${fs.readFileSync("public/render.js", "utf8")}
Object.assign(globalThis,{normalizeAiEstimate,aiFailKind,aiDisclosureAccepted,acceptAiDisclosure,AI_FAIL_COPY});`,
    context,
  );
  return { context, evaluate: (source) => vm.runInContext(source, context), saves: () => saves, confirms: () => confirms };
}

test("AI estimates require exact finite numeric fields, bounds, and macro agreement", () => {
  const app = harness();
  const normalize = (value) => JSON.parse(JSON.stringify(app.context.normalizeAiEstimate(value)));
  assert.deepEqual(normalize({ k: 501.4, p: 30.4, f: 20.4, c: 49.7 }), {
    ok: true,
    value: { k: 501, p: 30, f: 20, c: 50 },
  });
  for (const invalid of [
    null,
    { k: 500, p: 30, f: 20 },
    { k: 500, p: 30, f: 20, c: 50, note: "extra" },
    { k: "500", p: 30, f: 20, c: 50 },
    { k: Number.NaN, p: 30, f: 20, c: 50 },
    { k: Number.POSITIVE_INFINITY, p: 30, f: 20, c: 50 },
    { k: 0, p: 0, f: 0, c: 0 },
    { k: 5001, p: 30, f: 20, c: 50 },
    { k: 500, p: 1251, f: 0, c: 0 },
    { k: 500, p: 0, f: 557, c: 0 },
    { k: 500, p: 0, f: 0, c: 1251 },
    { k: 500, p: 1, f: 1, c: 1 },
  ]) assert.equal(normalize(invalid).ok, false, JSON.stringify(invalid));
});

test("AI failure classification separates auth, App Check, quota, and offline recovery", () => {
  const app = harness();
  assert.equal(app.context.aiFailKind({ status: 401 }), "auth");
  assert.equal(app.context.aiFailKind({ code: "firestore/permission-denied" }), "forbidden");
  assert.equal(app.context.aiFailKind({ status: 429 }), "quota");
  assert.equal(app.context.aiFailKind({ code: "firestore/unavailable" }), "offline");
  for (const key of ["auth", "forbidden", "quota", "offline"]) {
    assert.match(app.context.AI_FAIL_COPY[key], /بنفسك|يدوي/);
  }
});

test("disclosure acceptance persists only its version and ISO acceptance time", () => {
  const app = harness();
  assert.equal(app.context.acceptAiDisclosure(), true);
  assert.equal(app.saves(), 1);
  assert.equal(app.confirms(), 1);
  const settings = app.context.S.settings;
  assert.equal(settings.aiDisclosureVersion, 1);
  assert.match(settings.aiDisclosureAcceptedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Object.hasOwn(settings, "food"), false);
  assert.equal(Object.hasOwn(settings, "health"), false);
  assert.equal(app.context.acceptAiDisclosure(), true);
  assert.equal(app.saves(), 1);
  assert.equal(app.confirms(), 1);
});

test("non-canonical imported disclosure times do not suppress disclosure", () => {
  const app = harness();
  app.context.S.settings = { aiDisclosureVersion: 1, aiDisclosureAcceptedAt: "0" };
  assert.equal(app.context.aiDisclosureAccepted(), false);
  assert.equal(app.context.acceptAiDisclosure(), true);
  assert.equal(app.confirms(), 1);
  assert.equal(app.saves(), 1);
  assert.notEqual(app.context.S.settings.aiDisclosureAcceptedAt, "0");
});

test("declining the disclosure keeps manual entry and stores nothing", () => {
  const app = harness();
  app.context.confirm = () => false;
  assert.equal(app.context.acceptAiDisclosure(), false);
  assert.equal(app.saves(), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(app.context.S.settings)), {});
});

test("both AI call sites retain manual fallback and expected failures stay console-clean", () => {
  const source = fs.readFileSync("public/render.js", "utf8");
  assert.match(source, /function aiFill\([\s\S]*if\(!aiOn\(\)\)/);
  assert.match(source, /function aiCalRef\([\s\S]*if\(!aiOn\(\)\)/);
  assert.match(source, /function saveCalRef\(/);
  assert.doesNotMatch(source, /console\.error\([^)]*ai/i);
});
