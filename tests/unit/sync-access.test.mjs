import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, bad) => {
    resolve = ok;
    reject = bad;
  });
  return { promise, reject, resolve };
};
function createHarness(loadState = () => ({ settings: { ht: 170, name: "" }, days: {} })) {
  const elements = new Map();
  const membershipReads = [];
  const timers = new Map();
  const trackerRefs = new Map();
  const writes = [];
  let nextTimer = 1;
  const auth = { currentUser: null };
  const bridge = {
    currentUser: () => auth.currentUser,
    observeAuth: async () => () => {},
    signInForTest: async () => null,
    listenTracker(uid) {
      trackerRefs.set(uid, true);
      return Promise.resolve(() => {});
    },
    readMembership(uid) {
      const result = deferred();
      membershipReads.push({ uid, ...result });
      return result.promise;
    },
    writeTracker(uid, value) {
      const result = deferred();
      writes.push({ uid, value, ...result });
      return result.promise;
    },
    deleteTracker: async () => {},
    signOut: async () => {},
  };
  const window = { firebaseBridge: bridge, addEventListener() {} };
  const context = {
    URLSearchParams,
    console,
    location: { hostname: "localhost", search: "?test=1" },
    window,
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, { style: {}, textContent: "", value: "" });
        }
        return elements.get(id);
      },
    },
    localStorage: { setItem() {} },
    setTimeout(fn, delay) {
      const id = nextTimer++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    S: null,
    KEY: null,
    load: loadState,
    showTab() {},
    setDay() {},
    renderFormulaReview() {},
    today: () => "2026-08-24",
    renderDay() {},
    renderProg() {},
    renderCalRef() {},
    curTab: "day",
    calcTargets() {},
    validProfile() {},
    validTargets() {},
    macroMismatch() {},
    totals() {},
    project() {},
    isoWeekYear() {},
    formulaReviewDetails() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("public/sync.js", "utf8"), context);

  const evaluate = (source) => vm.runInContext(source, context);
  const timersAt = (delay) =>
    [...timers.entries()].filter(([, timer]) => timer.delay === delay);
  const runTimer = (delay) => {
    const matches = timersAt(delay);
    assert.equal(matches.length, 1, `expected one ${delay}ms timer`);
    const [id, timer] = matches[0];
    timers.delete(id);
    timer.fn();
  };
  const start = (uid = "member-1") => {
    auth.currentUser = { uid, displayName: "" };
    return evaluate("start(window.firebaseBridge.currentUser()); FB.active=true");
  };

  return {
    auth,
    elements,
    evaluate,
    membershipReads,
    runTimer,
    start,
    timers,
    timersAt,
    writes,
  };
}

test("a superseded account load cannot replace the active account state", async () => {
  const loads=new Map();
  const app=createHarness(uid=>{
    const result=deferred(); loads.set(uid,result); return result.promise;
  });
  app.start("account-a");
  app.start("account-b");
  loads.get("account-b").resolve({ settings:{ ht:170,name:"الحساب ب" },days:{},foods:{},calref:{} });
  await flushPromises();
  loads.get("account-a").resolve({ settings:{ ht:170,name:"الحساب أ" },days:{},foods:{},calref:{} });
  await flushPromises();
  assert.equal(app.evaluate("KEY"),"account-b");
  assert.equal(app.evaluate("S.settings.name"),"الحساب ب");
});

test("new accounts save immediately without a membership read or recheck timer", async () => {
  const app = createHarness();
  app.start();
  await flushPromises();
  assert.equal(app.membershipReads.length, 0);
  assert.equal(app.evaluate("GATE.state"), "ok");
  assert.equal(app.timersAt(300000).length, 0);
  app.evaluate('S.days["2026-08-24"]={water:1,_ts:123}; schedulePush()');
  app.runTimer(1200);
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].value.days["2026-08-24"].water, 1);
  app.writes[0].resolve();
  await flushPromises();
  assert.equal(app.elements.get("gate-note").style.display, "none");
});

test("permission failures retain local data, never request activation, and allow a later retry", async () => {
  const app = createHarness();
  app.start();
  await flushPromises();
  app.evaluate('S.days["2026-08-24"]={water:1}; schedulePush()');
  app.runTimer(1200);
  app.writes[0].reject({ code: "permission-denied" });
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "permission");
  assert.match(app.elements.get("gate-note").textContent, /السحابة رفضت الحفظ/);
  assert.doesNotMatch(app.elements.get("gate-note").textContent, /تفعيل|تجريبي/);
  assert.equal(app.timersAt(300000).length, 0);
  assert.equal(app.evaluate('S.days["2026-08-24"].water'), 1);
  app.evaluate("schedulePush()");
  app.runTimer(1200);
  app.writes[1].resolve();
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "ok");
});

test("denied write settling after logout cannot change gate timer or status", async () => {
  const app = createHarness();
  app.start();
  await flushPromises();
  app.evaluate("schedulePush()");
  app.runTimer(1200);
  assert.equal(app.writes.length, 1);

  app.auth.currentUser = null;
  app.evaluate("stop()");
  app.evaluate('document.getElementById("sync-status").textContent="logged out"');
  app.writes[0].reject({ code: "permission-denied" });
  await flushPromises();

  assert.equal(app.evaluate("GATE.state"), "ok");
  assert.equal(app.timersAt(300000).length, 0);
  assert.equal(
    app.evaluate('document.getElementById("sync-status").textContent'),
    "logged out",
  );
});

test("successful old-account write cannot alter the new session error", async () => {
  const app = createHarness();
  app.start("member-1");
  await flushPromises();
  app.evaluate("schedulePush()");
  app.runTimer(1200);
  assert.equal(app.writes.length, 1);

  app.start("member-2");
  await flushPromises();
  app.evaluate('setGate("quota"); document.getElementById("sync-status").textContent="new account"');
  assert.equal(app.evaluate("GATE.state"), "quota");
  assert.equal(app.timersAt(300000).length, 0);

  app.writes[0].resolve();
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "quota");
  assert.equal(app.timersAt(300000).length, 0);
  assert.equal(
    app.evaluate('document.getElementById("sync-status").textContent'),
    "new account",
  );
});
