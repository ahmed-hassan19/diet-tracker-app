import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AI_MODEL_ALLOWLIST,
  guardAiModule,
  guardDependencies,
  guardFirebaseConfig,
  guardFirebaseRc,
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
  const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  assert.deepEqual(guardAiModule(inline[0][1]), []);
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

test("firestore keys outside rules/indexes are rejected", () => {
  const config = baseConfig();
  config.firestore.databases = [];
  assert.ok(
    guardFirebaseConfig(config).some((s) => s.includes('firestore."databases"')),
  );
});

test("rc targets outside main/nice or without sites are rejected", () => {
  assert.ok(
    guardFirebaseRc({
      targets: { "diet-tracker-372ca": { hosting: { preview: ["diet-tracker-372ca"] } } },
    }).some((s) => s.includes("preview")),
  );
  assert.ok(
    guardFirebaseRc({
      targets: { "diet-tracker-372ca": { hosting: { main: [] } } },
    }).some((s) => s.includes("at least one site")),
  );
  assert.deepEqual(
    guardFirebaseRc({ targets: {} }).length,
    1,
  );
});

test("server SDK dependencies are rejected in either group", () => {
  assert.ok(
    guardDependencies({ devDependencies: { "firebase-admin": "^12" } }).length === 1,
  );
  assert.ok(
    guardDependencies({ dependencies: { "firebase-functions": "^5" } }).length === 1,
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
    assert.deepEqual(guardWorkflowText(sample).length, 1);
  });
}

test("clean check-and-release workflow passes the text guard", () => {
  assert.deepEqual(
    guardWorkflowText("steps:\n  - run: npm run check\n  - run: gh release create v1"),
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
  assert.ok(guardAiModule(stripped).some((s) => s.includes("explicit model name")));
});
