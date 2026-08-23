import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROJECT_ID = "diet-tracker-372ca";
export const FIRESTORE_RULES_RELEASE = `projects/${PROJECT_ID}/releases/cloud.firestore`;
export const PREFLIGHT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

export function matchingGateRuns(runs, tag, commitSha) {
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

export function preflightProblems(evidence, { tag, commitSha, model, now = Date.now() }) {
  const problems = [];
  const add = (ok, message) => {
    if (!ok) problems.push(message);
  };
  add(!!evidence && typeof evidence === "object" && !Array.isArray(evidence),
    "preflight evidence must be a JSON object");
  if (problems.length) return problems;
  add(evidence.schemaVersion === 1, "preflight schemaVersion must be 1");
  add(evidence.projectId === PROJECT_ID, `preflight projectId must be ${PROJECT_ID}`);
  add(evidence.tag === tag, `preflight tag must be ${tag}`);
  add(evidence.commitSha === commitSha, `preflight commitSha must be ${commitSha}`);
  const captured = Date.parse(evidence.capturedAt);
  add(Number.isFinite(captured), "preflight capturedAt must be an ISO timestamp");
  if (Number.isFinite(captured)) {
    add(captured <= now + 5 * 60 * 1000, "preflight capturedAt cannot be in the future");
    add(now - captured <= PREFLIGHT_MAX_AGE_MS,
      "preflight evidence is older than 24 hours; capture it again");
  }
  add(evidence.sparkPlan === "Spark", 'preflight sparkPlan must be "Spark"');
  add(evidence.billingAccountLinked === false,
    "preflight must confirm that no Cloud Billing account is linked");
  for (const field of [
    "quotaSnapshotCaptured",
    "combinedHostingUsageCaptured",
    "appCheckInventoryCaptured",
    "authenticatedUsersModeCaptured",
    "p4saAndApiKeyPostureCaptured",
    "aiLogRetentionCaptured",
    "wifHostCaptured",
  ]) {
    add(evidence[field] === true, `preflight ${field} must be true`);
  }
  add(evidence.model === model, `preflight model must be ${model}`);
  add(evidence.modelFreeTierConfirmed === true,
    "preflight must confirm the model remains available without billing");
  const capacity = evidence.capacity;
  add(!!capacity && typeof capacity === "object" && !Array.isArray(capacity),
    "preflight capacity must be an object");
  if (capacity && typeof capacity === "object" && !Array.isArray(capacity)) {
    add(Number.isInteger(capacity.invitedUserCap) && capacity.invitedUserCap >= 1,
      "capacity.invitedUserCap must be a positive integer");
    add(Number.isFinite(capacity.maxModeledQuotaPercent) &&
      capacity.maxModeledQuotaPercent >= 0 && capacity.maxModeledQuotaPercent <= 70,
    "capacity.maxModeledQuotaPercent must be between 0 and 70");
    add(Number.isFinite(capacity.reservePercent) && capacity.reservePercent >= 30,
      "capacity.reservePercent must be at least 30");
  }
  return problems;
}
