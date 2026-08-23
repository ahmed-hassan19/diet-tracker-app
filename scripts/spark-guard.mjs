/* Spark cost invariant: static allowlist guards for the no-billing boundary.
   Pure functions so validate.mjs and tests/unit/spark-guard.test.mjs share them.
   Static checks cannot prove console billing state; the owner's recorded
   Spark/no-billing evidence stays mandatory before any production mutation. */

export const PROJECT_ID = "diet-tracker-372ca";
export const HOSTING_TARGETS = ["main", "nice"];
export const FIRESTORE_CONFIG_KEYS = ["rules", "indexes"];
export const FB_CONFIG_KEYS = ["firestore", "hosting", "emulators"];
export const FORBIDDEN_DEPENDENCIES = ["firebase-admin", "firebase-functions"];

/* Denylist of anything that deploys, authenticates GCP, or bills from CI.
   Matched case-insensitively against raw workflow text; good enough for
   guarding our own repo without adding a YAML parser. */
export const FORBIDDEN_WORKFLOW_MARKERS = [
  "workload_identity_provider",
  "google-github-actions/auth",
  "hosting:channel:deploy",
  "firebase deploy",
  "id-token: write",
];

/* The shipped client may talk to Gemini only through Firebase AI Logic's
   GoogleAIBackend() on a reviewed Lite-tier model. Update this list only with
   measured calorie-reference spot checks (see AGENTS.md). */
export const AI_BACKEND_ALLOWLIST = ["GoogleAIBackend()"];
export const AI_MODEL_ALLOWLIST = ["gemini-flash-lite-latest"];

function problemsFor(push) {
  const p = [];
  return { p, add: (ok, msg) => { if (!ok) p.push(msg); } };
}

export function guardFirebaseConfig(config) {
  const { p, add } = problemsFor();
  add(!!config && typeof config === "object" && !Array.isArray(config),
    "firebase.json must be a JSON object");
  if (p.length) return p;
  for (const key of Object.keys(config)) {
    add(FB_CONFIG_KEYS.includes(key),
      `firebase.json key "${key}" is outside the Spark allowlist (${FB_CONFIG_KEYS.join(", ")})`);
  }
  if (config.firestore) {
    for (const key of Object.keys(config.firestore)) {
      add(FIRESTORE_CONFIG_KEYS.includes(key),
        `firebase.json firestore."${key}" is outside the allowlist (${FIRESTORE_CONFIG_KEYS.join(", ")})`);
    }
  }
  if (config.hosting !== undefined) {
    add(Array.isArray(config.hosting), 'firebase.json "hosting" must be an array');
    if (Array.isArray(config.hosting)) {
      for (const site of config.hosting) {
        add(HOSTING_TARGETS.includes(site.target),
          `hosting target "${site.target}" is outside the allowlist (${HOSTING_TARGETS.join(", ")})`);
        add(site.public === "public",
          `hosting target "${site.target}" must serve the "public" directory (got "${site.public}")`);
      }
    }
  }
  return p;
}

export function guardFirebaseRc(rc) {
  const { p, add } = problemsFor();
  const hosting = rc && rc.targets && rc.targets[PROJECT_ID] && rc.targets[PROJECT_ID].hosting;
  add(!!hosting, `.firebaserc must define hosting targets for ${PROJECT_ID}`);
  if (!hosting) return p;
  for (const name of Object.keys(hosting)) {
    add(HOSTING_TARGETS.includes(name),
      `.firebaserc hosting target "${name}" is outside the allowlist (${HOSTING_TARGETS.join(", ")})`);
    const sites = hosting[name];
    add(Array.isArray(sites) && sites.length >= 1,
      `.firebaserc hosting target "${name}" must map to at least one site (got ${JSON.stringify(sites)})`);
  }
  return p;
}

export function guardDependencies(pkg) {
  const { p } = problemsFor();
  const groups = [pkg.dependencies, pkg.devDependencies];
  for (const group of groups) {
    for (const name of Object.keys(group || {})) {
      if (FORBIDDEN_DEPENDENCIES.includes(name)) p.push(`forbidden dependency "${name}" (server SDKs need Blaze)`);
    }
  }
  return p;
}

export function guardWorkflowText(text) {
  const { p } = problemsFor();
  const hay = text.toLowerCase();
  for (const marker of FORBIDDEN_WORKFLOW_MARKERS) {
    if (hay.includes(marker.toLowerCase())) {
      p.push(`workflow contains forbidden marker "${marker}" (no CI deploy or GCP auth allowed)`);
    }
  }
  return p;
}

export function guardAiModule(inlineScript) {
  const { p, add } = problemsFor();
  for (const backend of AI_BACKEND_ALLOWLIST) {
    add(inlineScript.includes(backend),
      `AI module must use ${backend} (Gemini Developer API); Vertex/Agent Platform backends are prohibited`);
  }
  add(!/\bVertexAIBackend\b/.test(inlineScript), "AI module must not reference VertexAIBackend");
  const models = [...inlineScript.matchAll(/model:\s*"([^"]+)"/g)].map((m) => m[1]);
  add(models.length >= 1, "AI module must pin an explicit model name");
  for (const model of models) {
    add(AI_MODEL_ALLOWLIST.includes(model),
      `AI model "${model}" is outside the reviewed allowlist (${AI_MODEL_ALLOWLIST.join(", ")})`);
  }
  return p;
}
