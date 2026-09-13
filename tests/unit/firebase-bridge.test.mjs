import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function bridgeHarness({ enabled = true, userAgent = "", generate = null } = {}) {
  const html = fs.readFileSync("public/index.html", "utf8");
  const moduleSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;$/gm, "");
  const app = { single: true };
  const auth = { currentUser: { uid: "member-1", displayName: "", email: "" } };
  const db = { single: true };
  const memberships = [];
  let membershipReads = 0;
  let popupCalls = 0;
  let redirectCalls = 0;
  const modelCalls = [];
  const serviceApps = [];
  const context = {
    FB_BUILTIN: { config: { projectId: "demo" } },
    APP_CHECK_SITE_KEY: "site-key",
    TEST_MODE: false,
    Event: class { constructor(type) { this.type = type; } },
    Error,
    Object,
    Promise,
    String,
    JSON,
    window: { dispatchEvent() {}, matchMedia: () => ({ matches: false }) },
    navigator: { userAgent, standalone: false },
    initializeApp(config) { assert.equal(config.projectId, "demo"); return app; },
    initializeAppCheck(got) { serviceApps.push(got); },
    ReCaptchaV3Provider: class {},
    getAuth(got) { serviceApps.push(got); return auth; },
    getFirestore(got) { serviceApps.push(got); return db; },
    getAI(got) { serviceApps.push(got); return {}; },
    GoogleAIBackend: class {},
    Schema: { object: (value) => value, number: () => ({ type: "number" }) },
    getGenerativeModel() {
      return { generateContent: async (prompt) => {
        modelCalls.push(prompt);
        if (generate) return generate();
        return { response: { text: () => '{"k":100,"p":1,"f":0,"c":24}' } };
      } };
    },
    doc(_db, collection, uid) { return { collection, uid }; },
    async getDocFromServer(ref) {
      membershipReads++;
      const next = memberships.shift();
      assert.equal(ref.collection, "betaMembers");
      return {
        exists: () => !!next,
        data: () => next || {},
      };
    },
    getDoc: async () => ({ exists: () => false }),
    connectAuthEmulator() {}, connectFirestoreEmulator() {},
    deleteDoc: async () => {}, setDoc: async () => {},
    onSnapshot: () => () => {}, onAuthStateChanged: () => () => {},
    signInAnonymously: async () => ({ user: auth.currentUser }),
    getRedirectResult: async () => null,
    signInWithPopup: async () => { popupCalls++; return { user: auth.currentUser }; },
    signInWithRedirect: async () => { redirectCalls++; }, signOut: async () => {},
    GoogleAuthProvider: class {},
  };
  vm.createContext(context);
  vm.runInContext(moduleSource, context);
  context.window.AI_ENABLED = enabled;
  return { auth, bridge: context.window.firebaseBridge, memberships, membershipReads: () => membershipReads, modelCalls, serviceApps, popupCalls: () => popupCalls, redirectCalls: () => redirectCalls, app };
}

test("one app owns Auth, Firestore, App Check, and AI without exposing SDK objects", () => {
  const h = bridgeHarness({ enabled: false });
  assert.ok(h.serviceApps.length >= 4);
  assert.ok(h.serviceApps.every((value) => value === h.app));
  assert.equal(Object.hasOwn(h.bridge, "app"), false);
  assert.equal(Object.hasOwn(h.bridge, "auth"), false);
  assert.equal(Object.hasOwn(h.bridge, "db"), false);
});

test("AI is available to signed-in users without membership reads, but disabled and signed-out calls stop", async () => {
  const disabled = bridgeHarness({ enabled: false });
  await assert.rejects(disabled.bridge.estimateFood("تفاحة"), { code: "ai/disabled" });
  assert.equal(disabled.modelCalls.length, 0);
  const signedOut = bridgeHarness();
  signedOut.auth.currentUser = null;
  await assert.rejects(signedOut.bridge.estimateFood("تفاحة"), { code: "ai/unauthenticated" });
  assert.equal(signedOut.modelCalls.length, 0);
  const allowed = bridgeHarness();
  for (const membership of [null, { enabled: false }, { enabled: true }]) {
    allowed.memberships.push(membership);
    const result = await allowed.bridge.estimateFood("تفاحة");
    assert.equal(result.k, 100);
  }
  assert.equal(allowed.membershipReads(), 0);
  assert.equal(allowed.modelCalls.length, 3);
  assert.equal(Object.hasOwn(allowed.bridge, "readMembership"), false);
});

test("AI discards results if authentication changes during generation", async () => {
  for (const nextUser of [null, { uid: "other-account" }, { uid: "member-1" }]) {
    let resolve;
    const h = bridgeHarness({ generate: () => new Promise(done => { resolve = done; }) });
    const pending = h.bridge.estimateFood("تفاحة");
    h.auth.currentUser = nextUser;
    resolve({ response: { text: () => '{"k":100,"p":1,"f":0,"c":24}' } });
    await assert.rejects(pending, { code: "ai/unauthenticated" });
  }
});

test("mobile Google sign-in uses a full-page redirect instead of a popup", async () => {
  const h = bridgeHarness({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
  assert.equal(await h.bridge.signInGoogle(), null);
  assert.equal(h.popupCalls(), 0);
  assert.equal(h.redirectCalls(), 1);
});
