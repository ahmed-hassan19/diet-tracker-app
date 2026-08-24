import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROJECT_ID = "diet-tracker-372ca";
export const FIRESTORE_RULES_RELEASE = `projects/${PROJECT_ID}/releases/cloud.firestore`;
export const VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

export function publicFiles(root = "public") {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(root, full));
    }
  })(root);
  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function bundleDetails(root = "public") {
  const files = publicFiles(root);
  const lines = files
    .map((file) => `${sha256(fs.readFileSync(path.join(root, file)))}  ./${file}\n`)
    .join("");
  return { files, lines, hash: sha256(lines) };
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, sortedObject(value[key])]),
  );
}

function byJson(a, b) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function withoutStandardDefaults(value) {
  const copy = structuredClone(value);
  if (copy.ttl === false) delete copy.ttl;
  if (copy.apiScope === "ANY_API") delete copy.apiScope;
  if (copy.density === "SPARSE_ALL") delete copy.density;
  if (copy.multikey === false) delete copy.multikey;
  if (copy.unique === false) delete copy.unique;
  if (Array.isArray(copy.fields) && copy.fields.at(-1)?.fieldPath === "__name__") {
    copy.fields.pop();
  }
  if (Array.isArray(copy.indexes)) {
    copy.indexes = copy.indexes.map(withoutStandardDefaults);
  }
  return copy;
}

export function canonicalIndexSpec(spec) {
  const indexes = (spec && Array.isArray(spec.indexes) ? spec.indexes : [])
    .map(withoutStandardDefaults)
    .map(sortedObject)
    .sort(byJson);
  const fieldOverrides = (spec && Array.isArray(spec.fieldOverrides) ? spec.fieldOverrides : [])
    .map((field) => {
      const normalized = sortedObject(withoutStandardDefaults(field));
      if (Array.isArray(normalized.indexes)) normalized.indexes.sort(byJson);
      return normalized;
    })
    .sort(byJson);
  return JSON.stringify({ indexes, fieldOverrides });
}

export function taggedConfigHashes(root = ".") {
  const config = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
  if (!config.firestore || !config.firestore.rules || !config.firestore.indexes) {
    throw new Error("firebase.json must declare tagged Firestore rules and indexes files");
  }
  const rules = fs.readFileSync(path.join(root, config.firestore.rules));
  const indexes = JSON.parse(
    fs.readFileSync(path.join(root, config.firestore.indexes), "utf8"),
  );
  return {
    rulesetSha256: sha256(rules),
    indexesSha256: sha256(canonicalIndexSpec(indexes)),
    bundleSha256: bundleDetails(path.join(root, "public")).hash,
  };
}

export function matchingValidationRuns(runs, tag, commitSha) {
  return (Array.isArray(runs) ? runs : []).filter(
    (run) =>
      run.workflowName === "release" &&
      run.headBranch === tag &&
      run.headSha === commitSha &&
      run.event === "push" &&
      run.status === "completed" &&
      run.conclusion === "success",
  );
}

export function releaseVerificationProblems(record, { tag, commitSha, model, now = Date.now() }) {
  const problems = [];
  const add = (ok, message) => {
    if (!ok) problems.push(message);
  };
  add(!!record && typeof record === "object" && !Array.isArray(record),
    "release verification must be a JSON object");
  if (problems.length) return problems;
  add(record.schemaVersion === 1, "release verification schemaVersion must be 1");
  add(record.projectId === PROJECT_ID,
    `release verification projectId must be ${PROJECT_ID}`);
  add(record.tag === tag, `release verification tag must be ${tag}`);
  add(record.commitSha === commitSha,
    `release verification commitSha must be ${commitSha}`);
  const verifiedAt = Date.parse(record.verifiedAt);
  add(Number.isFinite(verifiedAt),
    "release verification verifiedAt must be an ISO timestamp");
  if (Number.isFinite(verifiedAt)) {
    add(verifiedAt <= now + 5 * 60 * 1000,
      "release verification verifiedAt cannot be in the future");
    add(now - verifiedAt <= VERIFICATION_MAX_AGE_MS,
      "release verification is older than 24 hours; check production settings again");
  }
  add(record.firebasePlan === "Spark",
    'release verification firebasePlan must be "Spark"');
  add(record.billingAccountLinked === false,
    "release verification must confirm that no Cloud Billing account is linked");
  add(Number.isFinite(record.maxObservedQuotaPercent) &&
    record.maxObservedQuotaPercent >= 0 && record.maxObservedQuotaPercent <= 70,
  "release verification maxObservedQuotaPercent must be between 0 and 70");
  add(record.appCheckVerified === true,
    "release verification must confirm App Check for both production hosts");
  add(record.model === model, `release verification model must be ${model}`);
  add(record.modelAvailableWithoutBilling === true,
    "release verification must confirm the model remains available without billing");
  return problems;
}

/* firebase-tools has printed `Active Project: <id>`, `Now using project <id>`,
   and (15.x) the bare project id; accept exactly those shapes and nothing else. */
export function activeFirebaseProject(output) {
  const lines = String(output ?? "").split(/\r?\n/).map((line) => line.trim());
  for (const line of lines) {
    const match =
      line.match(/^Active Project:\s*(\S+)$/) ||
      line.match(/^Now using project\s+(\S+)$/);
    if (match) return match[1];
  }
  const bare = lines.filter((line) => /^[a-z0-9-]+$/.test(line));
  return bare.length === 1 ? bare[0] : null;
}
