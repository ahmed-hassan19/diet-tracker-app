import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const food = { t: "وجبة مخصصة", k: 100, p: 10, f: 4, c: 6 };
const yesterday = "2026-09-12", today = "2026-09-13", tomorrow = "2026-09-14";
const sample = () => ({
  days: Object.fromEntries([yesterday, today, tomorrow].map(date => [date, { b: "c0", extras: ["c0"], _ts: 123 }])),
  settings: { builtinSelectionVersion: 1 },
  foods: { b: [{ ...food }], extras: [{ ...food, t: "إضافة مخصصة" }], _ts: 100 }, calref: {},
});
function harness(raw = sample()) {
  const elements = new Map();
  const context = {
    console, TextEncoder, TextDecoder, URLSearchParams, setTimeout, clearTimeout,
    location: { hostname: "example.com", search: "" },
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { style: { display: "none" }, textContent: "" });
      return elements.get(id);
    } },
    window: { addEventListener() {}, firebaseBridge: { currentUser: () => ({ uid: "owner" }), observeAuth: async () => {} } },
    alert() {}, renderDay() {}, renderFormulaReview() {}, formulaReviewDetails() {},
    curTab: "day", suEdit: true,
  };
  vm.createContext(context);
  vm.runInContext(["data", "calc", "state", "sync"].map(name => fs.readFileSync(`public/${name}.js`, "utf8")).join("\n"), context);
  context.raw = raw;
  vm.runInContext(`S=normalizeState(raw,"mutation").value; KEY="owner"; FB.ref={}; cur="${yesterday}";
    today=()=>"${today}"; globalThis.pushes=0; globalThis.actualSchedulePush=schedulePush; schedulePush=()=>{pushes++;};
    writeVerifiedStateRecord=async(uid,value)=>{globalThis.saved={uid,value};return value;};
    persistLiveState=()=>Promise.resolve(true);`, context);
  const run = source => vm.runInContext(source, context);
  const json = source => JSON.parse(JSON.stringify(run(source)));
  return { context, run, json };
}

test("retiring meals and extras while viewing yesterday preserves history and clears today onward durably", async () => {
  const h = harness(), before = h.json(`totals(S.days["${yesterday}"])`);
  for (const key of ["b", "extras"]) assert.equal(await h.run(`retireFood("${key}",0)`), true);
  const state = h.json("S");
  assert.deepEqual(state.days[yesterday], sample().days[yesterday]);
  assert.deepEqual(h.json(`totals(S.days["${yesterday}"])`), before);
  for (const date of [today, tomorrow]) {
    assert.equal(state.days[date].b, null);
    assert.deepEqual(state.days[date].extras, []);
    assert.ok(state.days[date]._ts > 123);
  }
  assert.deepEqual(state.foods.b[0], { ...food, deletedFrom: today });
  assert.deepEqual(h.json("saved.value"), state);
  assert.equal(h.run("saved.uid"), "owner");
  assert.equal(h.run("pushes"), 2);
  assert.equal(await h.run('retireFood("b",0)'), false);
  assert.equal(h.run("pushes"), 2);
  assert.ok(h.json("foodNames()").some(item => item.t === food.t));
  assert.ok(!h.json("foodNames(today())").some(item => item.t === food.t));
  assert.ok(!h.json("crNames()").includes(food.t));
  assert.equal(h.run(`commitMutation(s=>{s.days["${yesterday}"].b="c0";})`), true);
});

test("all normalization boundaries retain cutoffs, sanitize stale selections, and preserve legacy limits", () => {
  const h = harness(), raw = sample();
  raw.foods.b[0].deletedFrom = today;
  raw.foods.extras[0].deletedFrom = today;
  h.context.raw = raw;
  for (const source of ["mutation", "idb", "legacy", "import", "remote", "cloud"]) {
    const result = h.json(`normalizeState(${source === "remote" ? "{...raw,updated:1}" : "raw"},"${source}")`);
    assert.equal(result.ok, true, source);
    assert.equal(result.value.foods.b[0].deletedFrom, today);
    assert.equal(result.value.days[yesterday].b, "c0");
    assert.equal(result.value.days[today].b, null);
    assert.deepEqual(result.value.days[tomorrow].extras, []);
    assert.equal(h.run(`normalizeState(JSON.parse(JSON.stringify(normalizeState(raw,"mutation").value)),"idb").ok`), true);
  }
  for (const deletedFrom of [null, 20260913, "2026-02-30", "2026-9-13", "", "2026-09-13T00:00:00Z"]) {
    h.context.raw = { ...sample(), foods: { b: [{ ...food, deletedFrom }] } };
    assert.equal(h.run('normalizeState(raw,"mutation").ok'), false);
  }
  h.context.raw = { days: {}, settings: {}, foods: { b: Array(200).fill({ ...food, deletedFrom: today }) }, calref: {} };
  assert.equal(h.run('normalizeState(raw,"mutation").ok'), true);
  assert.equal(h.run('normalizeState({...raw,foods:{...raw.foods,extras:[raw.foods.b[0]]}},"mutation").ok'), false);
  assert.equal(h.run('normalizeState({...raw,foods:{b:[...raw.foods.b,raw.foods.b[0]]}},"mutation").ok'), false);
});

test("catalog merge keeps earliest cutoffs and rejects conflicting nutrition regardless of timestamps", async () => {
  const h = harness();
  await h.run('retireFood("b",0)');
  h.context.remote = sample();
  h.run(`remote.days["${today}"]._ts=Date.now()+100; remote.foods._ts=1; remote.updated=1;`);
  assert.equal(h.run("mergeRemote(remote)"), true);
  assert.equal(h.run(`S.days["${today}"].b`), null);
  assert.equal(h.run(`S.days["${yesterday}"].b`), "c0");
  h.run(`remote.foods.b[0].deletedFrom="${yesterday}";`);
  assert.equal(h.run("mergeRemote(remote)"), true);
  assert.equal(h.run(`S.days["${yesterday}"].b`), null);
  assert.equal(h.run("S.foods.b[0].deletedFrom"), yesterday);
  const before = h.json("S");
  h.run("remote.foods.b[0].k=999;");
  assert.equal(h.run("mergeRemote(remote)"), false);
  assert.equal(h.run("cloudWriteBlocked"), true);
  assert.deepEqual(h.json("S"), before);
  assert.equal(h.run("rawCloudState.foods.b[0].k"), 999);
});

test("retained indexes are never reused, compacted, or silently replaced by tombstones", () => {
  const h = harness();
  assert.equal(h.run('mergeFoodCatalogs({b:[null]},{b:[raw.foods.b[0]]}).ok'), false);
  assert.equal(h.run('mergeFoodCatalogs({b:[raw.foods.b[0]]},{b:[null]}).ok'), false);
  assert.deepEqual(h.json('mergeFoodCatalogs({b:[null]},{b:[null,raw.foods.b[0]]}).value.b'), [null, food]);
});

test("failed durable deletion leaves live state and synchronization untouched", async () => {
  const h = harness(), before = h.json("S");
  h.run('writeVerifiedStateRecord=async()=>{throw new Error("quota");};');
  assert.equal(await h.run('retireFood("b",0)'), false);
  assert.deepEqual(h.json("S"), before);
  assert.equal(h.run("pushes"), 0);
  assert.equal(h.run("pendingRetirement"), null);
});

test("pending deletion blocks same-session mutation and defers remote snapshots until verified persistence", async () => {
  const h = harness(), before = h.json("S");
  h.run('writeVerifiedStateRecord=()=>new Promise(resolve=>{globalThis.release=resolve;});');
  const pending = h.run('retireFood("b",0)');
  assert.deepEqual(h.json("S"), before);
  assert.equal(h.run('commitMutation(s=>{s.days[cur].water=9;})'), false);
  assert.equal(await h.run('retireFood("extras",0)'), false);
  h.context.remote = sample();
  h.run(`remote.days["${today}"].water=4;remote.days["${today}"]._ts=Date.now()+100;remote.updated=1;`);
  assert.equal(h.run("mergeRemote(remote)"), true);
  h.run("release();");
  assert.equal(await pending, true);
  assert.equal(h.run(`S.days["${today}"].b`), null);
  assert.equal(h.run(`S.days["${today}"].water`), 4);
});

test("UID and session changes during deletion cannot apply, render, or push the old account candidate", async () => {
  for (const change of ['KEY="other";', 'syncGeneration++;']) {
    const h = harness(), before = h.json("S");
    h.run('writeVerifiedStateRecord=()=>new Promise(resolve=>{globalThis.release=resolve;});');
    const pending = h.run('retireFood("b",0)');
    h.run(change + "release();");
    assert.equal(await pending, false);
    assert.deepEqual(h.json("S"), before);
    assert.equal(h.run("pushes"), 0);
  }
});


test("normalization upgrades legacy imports and rejects unsupported history format versions", () => {
  const h=harness();
  for(const source of ["mutation","idb","legacy","import","remote","cloud"]){
    assert.equal(h.run(`normalizeState(${source==="remote"?"{...raw,updated:1}":"raw"},"${source}").value.settings.foodHistoryVersion`),1);
  }
  for(const version of [0,2,null,1.5]){
    h.context.version=version;
    assert.equal(h.run('normalizeState({...raw,settings:{foodHistoryVersion:version}},"mutation").ok'),false);
  }
});

test("actual push timer cannot send prior state during deletion and sends the complete verified retirement afterward", async () => {
  const h=harness(),timers=[];
  h.context.setTimeout=fn=>{timers.push(fn);return timers.length;};
  h.context.clearTimeout=()=>{};
  h.context.window.firebaseBridge.writeTracker=async(_uid,value)=>{h.context.payload=value;};
  h.run('schedulePush=actualSchedulePush; FB.active=true; writeVerifiedStateRecord=()=>new Promise(resolve=>{globalThis.release=resolve;}); schedulePush();');
  const pending=h.run('retireFood("b",0)');
  timers.shift()();
  assert.equal(h.context.payload,undefined);
  h.run('release();');
  assert.equal(await pending,true);
  timers.shift()();
  assert.equal(h.context.payload.foods.b[0].deletedFrom,today);
  assert.equal(h.context.payload.days[today].b,null);
});

test("same UID session reset releases old locks and preserves the restarted session state", async () => {
  const h=harness();
  h.run('writeVerifiedStateRecord=()=>new Promise(resolve=>{globalThis.release=resolve;});');
  const pending=h.run('retireFood("b",0)');
  h.run('resetSyncContext(); KEY="owner";FB.ref={};commitMutation(s=>{s.days[cur].water=8;});');
  const restarted=h.json("S"),pushes=h.run("pushes");
  h.run("release();");
  assert.equal(await pending,false);
  assert.deepEqual(h.json("S"),restarted);
  assert.equal(h.run("pushes"),pushes);
  assert.equal(h.run("pendingRetirement"),null);
});


test("a skipped push timer retries prior dirty state when durable deletion fails", async () => {
  const h=harness(),timers=[];
  h.context.setTimeout=fn=>{timers.push(fn);return timers.length;};
  h.context.clearTimeout=()=>{};
  h.context.window.firebaseBridge.writeTracker=async(_uid,value)=>{h.context.payload=value;};
  h.run('schedulePush=actualSchedulePush; FB.active=true; commitMutation(s=>{s.days[cur].water=7;}); writeVerifiedStateRecord=()=>new Promise((_resolve,reject)=>{globalThis.fail=reject;});');
  const pending=h.run('retireFood("b",0)');
  timers.shift()();
  assert.equal(h.context.payload,undefined);
  h.run('fail(new Error("quota"));');
  assert.equal(await pending,false);
  timers.shift()();
  assert.equal(h.context.payload.days[yesterday].water,7);
  assert.equal(h.context.payload.foods.b[0].deletedFrom,undefined);
  assert.equal(h.context.payload.days[today].b,"c0");
});
