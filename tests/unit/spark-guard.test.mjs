import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AI_MODEL_ALLOWLIST,
  FIREBASE_WEB_SDK_VERSION,
  guardAiModule,
  guardDependencies,
  guardFirebaseClient,
  guardFirebaseConfig,
  guardFirebaseRc,
  guardFirestoreIndexes,
  guardWorkflowText,
} from "../../scripts/spark-guard.mjs";

test("firebase config accepts the shipped Spark-only shape", () => {
  const config = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
  assert.deepEqual(guardFirebaseConfig(config), []);
});

test("firebase rc accepts the two production targets", () => {
  const rc = JSON.parse(fs.readFileSync(".firebaserc", "utf8"));
  assert.deepEqual(guardFirebaseRc(rc), []);
});

test("package.json has no server-side Firebase SDKs", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.deepEqual(guardDependencies(pkg), []);
});

test("Firestore index configuration contains only Spark-safe index settings", () => {
  const indexes = JSON.parse(fs.readFileSync("firestore.indexes.json", "utf8"));
  assert.deepEqual(guardFirestoreIndexes(indexes), []);
});

const liveWorkflows = fs
  .readdirSync(".github/workflows")
  .map((name) => ({ name, text: fs.readFileSync(`.github/workflows/${name}`, "utf8") }));

test("no committed workflow authenticates GCP or deploys Firebase", () => {
  for (const { name, text } of liveWorkflows) {
    assert.deepEqual(guardWorkflowText(text), [], name);
  }
});

test("shipped AI module stays on an allowlisted Gemini Lite backend and model", () => {
  const html = fs.readFileSync("public/index.html", "utf8");
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  assert.deepEqual(guardAiModule(inline[0][1], { version }), []);
});

test("the whole public client has one app, no compat SDK, and no copied tokens", () => {
  const files = ["index.html", "data.js", "calc.js", "state.js", "render.js", "sync.js"];
  const source = files.map((name) => fs.readFileSync(`public/${name}`, "utf8")).join("\n");
  assert.deepEqual(guardFirebaseClient(source), []);
  for (const [addition, marker] of [
    ['\ninitializeApp(FB_BUILTIN.config,"ai");', "named second"],
    ['\nloadScript("firebase-auth-compat.js");', "compat"],
    ["\nconst idToken=await user.getIdToken();", "tokens"],
  ]) assert.ok(guardFirebaseClient(source+addition).some((problem) => problem.includes(marker)), marker);
});

function baseConfig() {
  return JSON.parse(fs.readFileSync("firebase.json", "utf8"));
}

test("functions, hosting extras, and storage config are rejected", () => {
  assert.ok(
    guardFirebaseConfig({ ...baseConfig(), functions: { source: "functions" } })
      .some((s) => s.includes('"functions"')),
  );
  assert.ok(
    guardFirebaseConfig({ ...baseConfig(), storage: { rules: "storage.rules" } })
      .some((s) => s.includes('"storage"')),
  );
  assert.ok(
    guardFirebaseConfig({ ...baseConfig(), apphosting: {} }).some((s) =>
      s.includes('"apphosting"'),
    ),
  );
});

test("foreign hosting targets and public dirs are rejected", () => {
  const config = baseConfig();
  config.hosting[0].target = "staging";
  assert.ok(guardFirebaseConfig(config).some((s) => s.includes("staging")));
  const wrongPublic = baseConfig();
  wrongPublic.hosting[0].public = "dist";
  assert.ok(guardFirebaseConfig(wrongPublic).some((s) => s.includes("dist")));
});

test("both Hosting targets are required exactly once", () => {
  const missing = baseConfig();
  missing.hosting.pop();
  assert.ok(guardFirebaseConfig(missing).some((s) => s.includes("exactly 2")));
  const duplicate = baseConfig();
  duplicate.hosting[1].target = "main";
  assert.ok(guardFirebaseConfig(duplicate).some((s) => s.includes("exactly once")));
});

test("dynamic Hosting rewrites are rejected", () => {
  const config = baseConfig();
  config.hosting[0].rewrites = [{ source: "/api/**", run: { serviceId: "paid" } }];
  assert.ok(guardFirebaseConfig(config).some((s) => s.includes('key "run"')));
});

test("firestore keys outside rules/indexes are rejected", () => {
  const config = baseConfig();
  config.firestore.databases = [];
  assert.ok(
    guardFirebaseConfig(config).some((s) => s.includes('key "databases"')),
  );
});

test("rc targets must be the exact two reviewed site mappings", () => {
  assert.ok(
    guardFirebaseRc({
      projects: { default: "diet-tracker-372ca" },
      targets: { "diet-tracker-372ca": { hosting: { preview: ["diet-tracker-372ca"] } } },
    }).some((s) => s.includes("preview")),
  );
  assert.ok(
    guardFirebaseRc({
      projects: { default: "diet-tracker-372ca" },
      targets: {
        "diet-tracker-372ca": {
          hosting: { main: ["diet-tracker-372ca", "third-site"], nice: ["5asesny"] },
        },
      },
    }).some((s) => s.includes("map exactly")),
  );
  assert.ok(
    guardFirebaseRc({ projects: {}, targets: {} }).some((s) => s.includes("default")),
  );
});

test("server SDK dependencies are rejected in either group", () => {
  assert.ok(
    guardDependencies({ devDependencies: { "firebase-admin": "^12" } }).length === 1,
  );
  assert.ok(
    guardDependencies({ dependencies: { "firebase-functions": "^5" } }).length === 1,
  );
  assert.ok(
    guardDependencies({ optionalDependencies: { "firebase-functions": "^6" } }).length === 1,
  );
  assert.ok(
    guardDependencies({ dependencies: { server: "npm:firebase-admin@^13" } }).length === 1,
  );
  assert.ok(
    guardDependencies({ scripts: { release: "npx firebase-tools deploy" } }).length === 1,
  );
  assert.deepEqual(guardDependencies({ devDependencies: { prettier: "3" } }), []);
});

for (const [marker, sample] of [
  ["workload_identity_provider", "workload_identity_provider: ${{ vars.X }}"],
  ["google-github-actions/auth", "- uses: google-github-actions/auth@v2"],
  ["hosting:channel:deploy", "run: npx firebase hosting:channel:deploy pr-1"],
  ["firebase deploy", "run: npx firebase deploy --only hosting:main"],
  ["id-token: write", "permissions:\n  id-token: write"],
]) {
  test(`workflow marker "${marker}" is rejected`, () => {
    assert.ok(guardWorkflowText(sample).length >= 1);
  });
}

test("clean check-and-release workflow passes the text guard", () => {
  assert.deepEqual(
    guardWorkflowText("steps:\n  - run: npm run check\n  - run: gh release create v1"),
    [],
  );
});

for (const sample of [
  "steps:\n  - run: npx firebase-tools deploy --only hosting:main",
  "steps:\n  - run: npx -y firebase-tools@latest deploy --only hosting:main",
  "steps:\n  - run: firebase-tools deploy --only hosting:main",
  "steps:\n  - run: npx firebase --project demo deploy --only firestore:rules",
  "steps:\n  - run: gcloud auth login && gcloud run deploy paid-service",
  "steps:\n  - run: node scripts/release-deploy.mjs v1.2.3",
  "permissions:\n  'id-token': 'write'",
]) {
  test(`workflow bypass is rejected: ${sample.split("\n").at(-1).trim()}`, () => {
    assert.ok(guardWorkflowText(sample).length >= 1);
  });
}

test("Firebase emulator commands remain allowed in CI", () => {
  assert.deepEqual(
    guardWorkflowText(
      'steps:\n  - run: npx firebase emulators:exec --only firestore "npm test"',
    ),
    [],
  );
});

const aiModule = (() => {
  const html = fs.readFileSync("public/index.html", "utf8");
  return html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
})();

test("vertex backend is rejected even with an allowlisted model", () => {
  const swapped = aiModule.replace("GoogleAIBackend()", "VertexAIBackend()");
  assert.ok(guardAiModule(swapped).some((s) => s.includes("VertexAIBackend")));
});

test("unreviewed AI models are rejected", () => {
  const swapped = aiModule.replace(
    `model:"${AI_MODEL_ALLOWLIST[0]}"`,
    'model:"gemini-flash-pro"',
  );
  assert.ok(guardAiModule(swapped).some((s) => s.includes("gemini-flash-pro")));
});

test("missing explicit model pin is rejected", () => {
  const stripped = aiModule.replace(/model:"[^"]+",/, "");
  assert.ok(guardAiModule(stripped).some((s) => s.includes("exactly one literal")));
});

test("second apps, compat SDKs, token copying, and SDK drift are rejected", () => {
  for (const [source, marker] of [
    [aiModule.replace("initializeApp(FB_BUILTIN.config)", 'initializeApp(FB_BUILTIN.config,"ai")'), "single default app"],
    [aiModule.replace("firebase-auth.js", "firebase-auth-compat.js"), "compat SDKs"],
    [aiModule.replace("const bridge=", "const accessToken=await auth.currentUser.getIdToken();\nconst bridge="), "copy Auth tokens"],
    [aiModule.replaceAll(FIREBASE_WEB_SDK_VERSION, "12.18.0"), FIREBASE_WEB_SDK_VERSION],
  ]) {
    assert.ok(guardAiModule(source).some((problem) => problem.includes(marker)), marker);
  }
});

test("AI bridge remains disabled and performs a fresh fail-closed membership read per request", () => {
  assert.match(aiModule, /window\.AI_ENABLED=false/);
  assert.match(aiModule, /estimateFood:async text=>\{/);
  assert.match(aiModule, /window\.AI_ENABLED!==true[\s\S]*getDocFromServer\(doc\(db,"betaMembers",user\.uid\)\)[\s\S]*model\.generateContent\(/);
  assert.doesNotMatch(aiModule, /getIdToken|accessToken|initializeApp\([^)]*,\s*["']ai["']/);
});

test("AI flag accepts the disabled rollout and only later eligible enabled versions", () => {
  const enabled = aiModule.replace("window.AI_ENABLED=false;", "window.AI_ENABLED=true;");
  assert.deepEqual(guardAiModule(aiModule, { version: "3.7.0" }), []);
  assert.deepEqual(guardAiModule(enabled, { version: "3.7.1" }), []);
  assert.ok(guardAiModule(enabled, { version: "3.7.0" })
    .some((problem) => problem.includes("3.7.1 onward")));
  assert.ok(guardAiModule(enabled.replace("window.AI_ENABLED=true;", "window.AI_ENABLED=flag;"), {
    version: "3.7.1",
  }).some((problem) => problem.includes("exactly one literal")));
});

test("dead allowlisted strings cannot hide runtime-selected AI configuration", () => {
  const deceptive = `
    // new GoogleAIBackend() model: "${AI_MODEL_ALLOWLIST[0]}"
    const modelName = "unreviewed-model";
    getGenerativeModel(getAI(app, { backend: makeBackend() }), { model: modelName });
  `;
  const problems = guardAiModule(deceptive);
  assert.ok(problems.some((s) => s.includes("GoogleAIBackend")));
  assert.ok(problems.some((s) => s.includes("runtime expression")));
});

test("TTL, vector, and search index configuration is rejected", () => {
  assert.ok(
    guardFirestoreIndexes({
      indexes: [],
      fieldOverrides: [{ collectionGroup: "trackers", fieldPath: "days", ttl: true, indexes: [] }],
    }).some((s) => s.includes('key "ttl"')),
  );
  assert.ok(
    guardFirestoreIndexes({
      indexes: [{
        collectionGroup: "trackers",
        queryScope: "COLLECTION",
        fields: [{ fieldPath: "days", vectorConfig: { dimension: 3 } }],
      }],
      fieldOverrides: [],
    }).some((s) => s.includes('key "vectorConfig"')),
  );
});
