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
const membershipSnapshot = (exists, enabled = false) => ({
  exists,
  data: () => ({ enabled }),
});

function createHarness() {
  const elements = new Map();
  const membershipReads = [];
  const timers = new Map();
  const trackerRefs = new Map();
  const writes = [];
  let nextTimer = 1;
  const auth = {
    currentUser: null,
    useEmulator() {},
    onAuthStateChanged() {},
    signInAnonymously: async () => {},
  };
  const trackerRef = (uid) => {
    if (!trackerRefs.has(uid)) {
      trackerRefs.set(uid, {
        onSnapshot() {
          return () => {};
        },
        set(value) {
          const result = deferred();
          writes.push({ uid, value, ...result });
          return result.promise;
        },
      });
    }
    return trackerRefs.get(uid);
  };
  const firestore = {
    useEmulator() {},
    collection(name) {
      return {
        doc(uid) {
          if (name === "betaMembers") {
            return {
              get() {
                const result = deferred();
                membershipReads.push({ uid, ...result });
                return result.promise;
              },
            };
          }
          return trackerRef(uid);
        },
      };
    },
  };
  const firebase = {
    apps: [{}],
    auth: () => auth,
    firestore: () => firestore,
  };
  const context = {
    URLSearchParams,
    console,
    firebase,
    location: { hostname: "localhost", search: "?test=1" },
    window: { firebase },
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
    load: () => ({ settings: { ht: 186, name: "" }, days: {} }),
    migrateReviewedProfile: () => false,
    showTab() {},
    setDay() {},
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
    evaluate("start(firebase.auth().currentUser); FB.active=true");
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

test("absent membership schedules one five-minute recheck", async () => {
  const app = createHarness();
  app.start();
  app.membershipReads[0].resolve(membershipSnapshot(false));
  await flushPromises();

  assert.equal(app.evaluate("GATE.state"), "pending");
  assert.equal(app.timersAt(300000).length, 1);
});

test("disabled membership keeps one recurring recheck and flushes on recovery", async () => {
  const app = createHarness();
  app.start();
  app.membershipReads[0].resolve(membershipSnapshot(true, false));
  await flushPromises();

  assert.equal(app.evaluate("GATE.state"), "pending");
  assert.equal(app.timersAt(300000).length, 1);
  const firstTimer = app.timersAt(300000)[0][0];
  app.evaluate('setGate("pending")');
  assert.equal(app.timers.has(firstTimer), false);
  assert.equal(app.timersAt(300000).length, 1);

  app.runTimer(300000);
  app.membershipReads[1].resolve(membershipSnapshot(true, false));
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "pending");
  assert.equal(app.timersAt(300000).length, 1);

  app.runTimer(300000);
  app.membershipReads[2].reject(new Error("offline"));
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "pending");
  assert.equal(app.timersAt(300000).length, 1);

  app.evaluate(
    'S.days["2026-08-24"]={water:1,_ts:123}; schedulePush()',
  );
  app.runTimer(1200);
  assert.equal(app.writes.length, 0);
  assert.equal(app.timersAt(300000).length, 1);

  app.runTimer(300000);
  app.membershipReads[3].resolve(membershipSnapshot(true, true));
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "ok");
  assert.equal(app.timersAt(300000).length, 0);
  assert.equal(app.timersAt(1200).length, 1);

  app.runTimer(1200);
  assert.equal(app.writes.length, 1);
  app.writes[0].resolve();
  await flushPromises();
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.writes[0].value.days["2026-08-24"])),
    { water: 1, _ts: 123 },
  );
});

test("newer membership read wins when overlapping reads settle out of order", async () => {
  const app = createHarness();
  app.start();
  app.evaluate("loadMembership()");
  assert.equal(app.membershipReads.length, 2);

  app.membershipReads[1].resolve(membershipSnapshot(true, true));
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "ok");

  app.membershipReads[0].resolve(membershipSnapshot(true, false));
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "ok");
  assert.equal(app.timersAt(300000).length, 0);
});

test("denied write settling after logout cannot change gate timer or status", async () => {
  const app = createHarness();
  app.start();
  app.membershipReads[0].resolve(membershipSnapshot(true, true));
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

test("successful old-account write cannot alter the new pending session", async () => {
  const app = createHarness();
  app.start("member-1");
  app.membershipReads[0].resolve(membershipSnapshot(true, true));
  await flushPromises();
  app.evaluate("schedulePush()");
  app.runTimer(1200);
  assert.equal(app.writes.length, 1);

  app.start("member-2");
  app.membershipReads[1].resolve(membershipSnapshot(true, false));
  await flushPromises();
  app.evaluate('document.getElementById("sync-status").textContent="new account"');
  assert.equal(app.evaluate("GATE.state"), "pending");
  assert.equal(app.timersAt(300000).length, 1);

  app.writes[0].resolve();
  await flushPromises();
  assert.equal(app.evaluate("GATE.state"), "pending");
  assert.equal(app.timersAt(300000).length, 1);
  assert.equal(
    app.evaluate('document.getElementById("sync-status").textContent'),
    "new account",
  );
});
