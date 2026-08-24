import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function bridgeHarness({ enabled = true } = {}) {
  const html = fs.readFileSync("public/index.html", "utf8");
  const moduleSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;$/gm, "");
  const app = { single: true };
  const auth = { currentUser: { uid: "member-1", displayName: "", email: "" } };
  const db = { single: true };
  const memberships = [];
  let membershipReads = 0;
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
    window: { dispatchEvent() {} },
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
    signInWithPopup: async () => ({ user: auth.currentUser }),
    signInWithRedirect: async () => {}, signOut: async () => {},
    GoogleAuthProvider: class {},
  };
  vm.createContext(context);
  vm.runInContext(moduleSource, context);
  context.window.AI_ENABLED = enabled;
  return { auth, bridge: context.window.firebaseBridge, memberships, membershipReads: () => membershipReads, modelCalls, serviceApps, app };
}

test("one app owns Auth, Firestore, App Check, and AI without exposing SDK objects", () => {
  const h = bridgeHarness({ enabled: false });
  assert.ok(h.serviceApps.length >= 4);
  assert.ok(h.serviceApps.every((value) => value === h.app));
  assert.equal(Object.hasOwn(h.bridge, "app"), false);
  assert.equal(Object.hasOwn(h.bridge, "auth"), false);
  assert.equal(Object.hasOwn(h.bridge, "db"), false);
});

test("every AI call freshly checks membership and disabled or denied calls fail closed", async () => {
  const disabled = bridgeHarness({ enabled: false });
  await assert.rejects(disabled.bridge.estimateFood("تفاحة"), { code: "ai/disabled" });
  assert.equal(disabled.membershipReads(), 0);
  assert.equal(disabled.modelCalls.length, 0);

  const denied = bridgeHarness();
  denied.memberships.push(null);
  await assert.rejects(denied.bridge.estimateFood("تفاحة"), { code: "ai/forbidden" });
  assert.equal(denied.membershipReads(), 1);
  assert.equal(denied.modelCalls.length, 0);

  const allowed = bridgeHarness();
  allowed.memberships.push({ enabled: true }, { enabled: true });
  await allowed.bridge.estimateFood("تفاحة");
  await allowed.bridge.estimateFood("موزة");
  assert.equal(allowed.memberships.length, 0);
  assert.equal(allowed.membershipReads(), 2);
  assert.equal(allowed.modelCalls.length, 2);
});
