/* Spark cost invariant: static allowlist guards for the no-billing boundary.
   Pure functions so validate.mjs and tests/unit/spark-guard.test.mjs share them.
   Static checks cannot prove console billing state; the owner's recorded
   Spark/no-billing evidence stays mandatory before any production mutation. */

export const PROJECT_ID = "diet-tracker-372ca";
export const HOSTING_TARGETS = ["main", "nice"];
export const HOSTING_SITES = {
  main: ["diet-tracker-372ca"],
  nice: ["5asesny"],
};
export const FIRESTORE_CONFIG_KEYS = ["rules", "indexes"];
export const FB_CONFIG_KEYS = ["firestore", "hosting", "emulators"];
export const FORBIDDEN_DEPENDENCIES = ["firebase-admin", "firebase-functions"];

/* Denylist of anything that deploys, authenticates GCP, or bills from CI.
   Matched case-insensitively against raw workflow text; good enough for
   guarding our own repo without adding a YAML parser. */
const FORBIDDEN_WORKFLOW_PATTERNS = [
  [/["']?id-token["']?\s*:\s*["']?write\b/i, "OIDC id-token write permission"],
  [/workload[_-]identity[_-]provider/i, "Workload Identity provider"],
  [/google-github-actions\//i, "Google authentication/deployment action"],
  [/\bgcloud\b/i, "gcloud command"],
  [/\b(?:gsutil|bq)\b/i, "Google Cloud command"],
  [/(?:FIREBASE_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GHA_CREDS_PATH|CLOUDSDK_AUTH)/i,
    "cloud credential variable"],
  [/\b(?:hosting:channel:deploy|hosting:clone)\b/i,
    "production or preview deployment path"],
  [/\b(?:node|bun|deno)\s+(?:\.\/)?scripts\/release-deploy\.mjs\b/i,
    "production deployment script invocation"],
  [/\b(?:npx\s+(?:-{1,2}[^\s]+\s+)*|pnpm\s+(?:(?:dlx|exec)\s+)?|yarn\s+(?:dlx\s+)?)firebase(?:-tools)?(?:@[^\s]+)?\s+(?!emulators:(?:exec|start)\b)/i,
    "non-emulator Firebase CLI command"],
  [/(?:^|\brun:\s*|[;&|]\s*)firebase(?:-tools)?(?:@[^\s]+)?\s+(?!emulators:(?:exec|start)\b)/im,
    "non-emulator Firebase CLI command"],
  [/(?:firebaserules|firestore|cloudresourcemanager|iam)\.googleapis\.com/i,
    "direct Google Cloud API call"],
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

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sameStrings(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function rejectUnknownKeys(value, allowed, add, label) {
  if (!isObject(value)) {
    add(false, `${label} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) {
    add(allowed.includes(key), `${label} key "${key}" is outside the allowlist (${allowed.join(", ")})`);
  }
}

export function guardFirebaseConfig(config) {
  const { p, add } = problemsFor();
  add(isObject(config), "firebase.json must be a JSON object");
  if (p.length) return p;
  rejectUnknownKeys(config, FB_CONFIG_KEYS, add, "firebase.json");
  add(FB_CONFIG_KEYS.every((key) => Object.hasOwn(config, key)),
    `firebase.json must contain exactly ${FB_CONFIG_KEYS.join(", ")}`);
  rejectUnknownKeys(config.firestore, FIRESTORE_CONFIG_KEYS, add, "firebase.json firestore");
  if (isObject(config.firestore)) {
    add(config.firestore.rules === "firestore.rules",
      'firebase.json firestore.rules must be "firestore.rules"');
    add(config.firestore.indexes === "firestore.indexes.json",
      'firebase.json firestore.indexes must be "firestore.indexes.json"');
  }
  add(Array.isArray(config.hosting), 'firebase.json "hosting" must be an array');
  if (Array.isArray(config.hosting)) {
    add(config.hosting.length === HOSTING_TARGETS.length,
      `firebase.json must define exactly ${HOSTING_TARGETS.length} Hosting targets`);
    add(sameStrings(config.hosting.map((site) => site && site.target), HOSTING_TARGETS),
      `firebase.json must define each Hosting target exactly once (${HOSTING_TARGETS.join(", ")})`);
    for (const site of config.hosting) {
      rejectUnknownKeys(site,
        ["target", "public", "ignore", "rewrites", "redirects", "headers", "cleanUrls", "trailingSlash"],
        add, `hosting target "${site && site.target}"`);
      if (!isObject(site)) continue;
      add(HOSTING_TARGETS.includes(site.target),
        `hosting target "${site.target}" is outside the allowlist (${HOSTING_TARGETS.join(", ")})`);
      add(site.public === "public",
        `hosting target "${site.target}" must serve the "public" directory (got "${site.public}")`);
      for (const rewrite of site.rewrites || []) {
        rejectUnknownKeys(rewrite, ["source", "destination"], add,
          `hosting target "${site.target}" rewrite`);
      }
    }
  }
  return p;
}

export function guardFirebaseRc(rc) {
  const { p, add } = problemsFor();
  add(isObject(rc), ".firebaserc must be a JSON object");
  if (!isObject(rc)) return p;
  rejectUnknownKeys(rc, ["projects", "targets", "etags"], add, ".firebaserc");
  add(isObject(rc.projects) && rc.projects.default === PROJECT_ID &&
    Object.keys(rc.projects).length === 1,
  `.firebaserc projects must contain only default=${PROJECT_ID}`);
  add(isObject(rc.targets) && sameStrings(Object.keys(rc.targets), [PROJECT_ID]),
    `.firebaserc targets must contain only ${PROJECT_ID}`);
  const hosting = rc && rc.targets && rc.targets[PROJECT_ID] && rc.targets[PROJECT_ID].hosting;
  add(!!hosting, `.firebaserc must define hosting targets for ${PROJECT_ID}`);
  if (!hosting) return p;
  add(sameStrings(Object.keys(hosting), HOSTING_TARGETS),
    `.firebaserc must define exactly ${HOSTING_TARGETS.join(", ")}`);
  for (const name of Object.keys(hosting)) {
    add(HOSTING_TARGETS.includes(name),
      `.firebaserc hosting target "${name}" is outside the allowlist (${HOSTING_TARGETS.join(", ")})`);
    const sites = hosting[name];
    add(JSON.stringify(sites) === JSON.stringify(HOSTING_SITES[name]),
      `.firebaserc hosting target "${name}" must map exactly to ${JSON.stringify(HOSTING_SITES[name])}`);
  }
  return p;
}

export function guardDependencies(pkg) {
  const { p } = problemsFor();
  const groupNames = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const groupName of groupNames) {
    for (const [name, spec] of Object.entries(pkg[groupName] || {})) {
      const alias = typeof spec === "string" &&
        FORBIDDEN_DEPENDENCIES.some((forbidden) => spec.startsWith(`npm:${forbidden}@`));
      if (FORBIDDEN_DEPENDENCIES.includes(name) || alias) {
        p.push(`forbidden dependency "${name}" in ${groupName} (server SDKs need Blaze)`);
      }
    }
  }
  for (const name of pkg.bundledDependencies || pkg.bundleDependencies || []) {
    if (FORBIDDEN_DEPENDENCIES.includes(name)) {
      p.push(`forbidden bundled dependency "${name}" (server SDKs need Blaze)`);
    }
  }
  for (const [name, script] of Object.entries(pkg.scripts || {})) {
    for (const problem of guardWorkflowText(`run: ${script}`)) {
      p.push(`package script "${name}" is forbidden: ${problem}`);
    }
  }
  return p;
}

export function guardWorkflowText(text) {
  const { p } = problemsFor();
  for (const [pattern, label] of FORBIDDEN_WORKFLOW_PATTERNS) {
    if (pattern.test(text)) {
      p.push(`workflow contains ${label} (no CI deploy or GCP auth allowed)`);
    }
  }
  return p;
}

function stripJsComments(source) {
  let output = "";
  let quote = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      output += char;
      if (char === "\\") output += source[++i] || "";
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      output += char;
    } else if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      output += "\n";
    } else if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
      output += " ";
    } else {
      output += char;
    }
  }
  return output;
}

export function guardAiModule(inlineScript) {
  const { p, add } = problemsFor();
  const code = stripJsComments(inlineScript);
  const backendConstructions = code.match(/\bnew\s+GoogleAIBackend\s*\(\s*\)/g) || [];
  add(backendConstructions.length === 1,
    "AI module must construct GoogleAIBackend exactly once");
  add(/getGenerativeModel\s*\(\s*getAI\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*\{\s*backend\s*:\s*new\s+GoogleAIBackend\s*\(\s*\)\s*\}\s*\)\s*,/.test(code),
    "getGenerativeModel must receive getAI(app, {backend:new GoogleAIBackend()}) directly");
  for (const marker of [
    "VertexAIBackend",
    "GoogleGenerativeAI",
    "generativelanguage.googleapis.com",
    "aiplatform.googleapis.com",
  ]) {
    add(!code.includes(marker), `AI module must not reference ${marker}`);
  }
  const modelValues = [...code.matchAll(/\bmodel\s*:\s*([^,\r\n}]+)/g)]
    .map((match) => match[1].trim());
  add(modelValues.length === 1, "AI module must define exactly one literal model property");
  if (modelValues.length === 1) {
    const literal = modelValues[0].match(/^"([^"]+)"$/);
    add(!!literal, "AI model must be a double-quoted literal, not a runtime expression");
    if (literal) {
      add(AI_MODEL_ALLOWLIST.includes(literal[1]),
        `AI model "${literal[1]}" is outside the reviewed allowlist (${AI_MODEL_ALLOWLIST.join(", ")})`);
    }
  }
  return p;
}

export function guardFirestoreIndexes(spec) {
  const { p, add } = problemsFor();
  rejectUnknownKeys(spec, ["indexes", "fieldOverrides"], add, "firestore indexes");
  if (!isObject(spec)) return p;
  add(Array.isArray(spec.indexes), "firestore indexes.indexes must be an array");
  add(Array.isArray(spec.fieldOverrides), "firestore indexes.fieldOverrides must be an array");
  for (const index of spec.indexes || []) {
    rejectUnknownKeys(index, ["collectionGroup", "queryScope", "fields"], add,
      "Firestore composite index");
    if (!isObject(index)) continue;
    add(typeof index.collectionGroup === "string" && index.collectionGroup.length > 0,
      "Firestore composite index collectionGroup must be a non-empty string");
    add(["COLLECTION", "COLLECTION_GROUP"].includes(index.queryScope),
      "Firestore composite index queryScope must be COLLECTION or COLLECTION_GROUP");
    add(Array.isArray(index.fields) && index.fields.length > 0,
      "Firestore composite index fields must be a non-empty array");
    for (const field of index.fields || []) {
      rejectUnknownKeys(field, ["fieldPath", "order", "arrayConfig"], add,
        "Firestore composite-index field");
      if (!isObject(field)) continue;
      add(typeof field.fieldPath === "string" && field.fieldPath.length > 0,
        "Firestore composite-index fieldPath must be a non-empty string");
      add(Number(Object.hasOwn(field, "order")) + Number(Object.hasOwn(field, "arrayConfig")) === 1,
        "Firestore composite-index field must define exactly one of order or arrayConfig");
    }
  }
  for (const override of spec.fieldOverrides || []) {
    rejectUnknownKeys(override, ["collectionGroup", "fieldPath", "indexes"], add,
      "Firestore field override");
    if (!isObject(override)) continue;
    add(typeof override.collectionGroup === "string" && override.collectionGroup.length > 0,
      "Firestore field override collectionGroup must be a non-empty string");
    add(typeof override.fieldPath === "string" && override.fieldPath.length > 0,
      "Firestore field override fieldPath must be a non-empty string");
    add(Array.isArray(override.indexes), "Firestore field override indexes must be an array");
    for (const index of override.indexes || []) {
      rejectUnknownKeys(index, ["order", "arrayConfig", "queryScope"], add,
        "Firestore field-override index");
      if (!isObject(index)) continue;
      add(Number(Object.hasOwn(index, "order")) + Number(Object.hasOwn(index, "arrayConfig")) === 1,
        "Firestore field-override index must define exactly one of order or arrayConfig");
      add(["COLLECTION", "COLLECTION_GROUP"].includes(index.queryScope),
        "Firestore field-override index queryScope must be COLLECTION or COLLECTION_GROUP");
    }
  }
  return p;
}
