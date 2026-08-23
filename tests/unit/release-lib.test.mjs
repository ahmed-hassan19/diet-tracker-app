import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  FIRESTORE_RULES_RELEASE,
  PROJECT_ID,
  canonicalIndexSpec,
  matchingGateRuns,
  preflightProblems,
  taggedConfigHashes,
} from "../../scripts/release-lib.mjs";

const TAG = "v3.6.0";
const COMMIT = "a".repeat(40);
const MODEL = "gemini-flash-lite-latest";
const NOW = Date.parse("2026-08-23T12:00:00.000Z");

function validPreflight() {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    tag: TAG,
    commitSha: COMMIT,
    capturedAt: "2026-08-23T11:00:00.000Z",
    sparkPlan: "Spark",
    billingAccountLinked: false,
    quotaSnapshotCaptured: true,
    combinedHostingUsageCaptured: true,
    appCheckInventoryCaptured: true,
    authenticatedUsersModeCaptured: true,
    p4saAndApiKeyPostureCaptured: true,
    aiLogRetentionCaptured: true,
    wifHostCaptured: true,
    model: MODEL,
    modelFreeTierConfirmed: true,
    capacity: {
      invitedUserCap: 20,
      maxModeledQuotaPercent: 65,
      reservePercent: 35,
    },
  };
}

test("release verification uses Firebase's default Firestore release name", () => {
  assert.equal(
    FIRESTORE_RULES_RELEASE,
    `projects/${PROJECT_ID}/releases/cloud.firestore`,
  );
});

test("only the exact successful tag-gate run matches", () => {
  const good = {
    databaseId: 42,
    workflowName: "release",
    headBranch: TAG,
    headSha: COMMIT,
    event: "push",
    status: "completed",
    conclusion: "success",
  };
  assert.deepEqual(matchingGateRuns([good], TAG, COMMIT), [good]);
  for (const change of [
    { workflowName: "quality" },
    { headBranch: "v3.5.1" },
    { headSha: "b".repeat(40) },
    { event: "workflow_dispatch" },
    { status: "in_progress" },
    { conclusion: "failure" },
  ]) {
    assert.deepEqual(matchingGateRuns([{ ...good, ...change }], TAG, COMMIT), []);
  }
});

test("release preflight requires fresh Spark, posture, and capacity evidence", () => {
  assert.deepEqual(
    preflightProblems(validPreflight(), { tag: TAG, commitSha: COMMIT, model: MODEL, now: NOW }),
    [],
  );
  const invalid = validPreflight();
  invalid.billingAccountLinked = true;
  invalid.authenticatedUsersModeCaptured = false;
  invalid.capacity.maxModeledQuotaPercent = 71;
  invalid.capacity.reservePercent = 29;
  const problems = preflightProblems(invalid, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    now: NOW,
  });
  assert.ok(problems.some((problem) => problem.includes("no Cloud Billing")));
  assert.ok(problems.some((problem) => problem.includes("authenticatedUsersModeCaptured")));
  assert.ok(problems.some((problem) => problem.includes("between 0 and 70")));
  assert.ok(problems.some((problem) => problem.includes("at least 30")));
});

test("stale or unbound preflight evidence is rejected", () => {
  const stale = validPreflight();
  stale.capturedAt = "2026-08-20T11:00:00.000Z";
  stale.commitSha = "b".repeat(40);
  const problems = preflightProblems(stale, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    now: NOW,
  });
  assert.ok(problems.some((problem) => problem.includes("commitSha")));
  assert.ok(problems.some((problem) => problem.includes("older than 24 hours")));
});

test("index hashes are insensitive to top-level declaration order", () => {
  const first = {
    indexes: [
      { collectionGroup: "b", queryScope: "COLLECTION", fields: [] },
      { collectionGroup: "a", queryScope: "COLLECTION", fields: [] },
    ],
    fieldOverrides: [],
  };
  const second = { ...first, indexes: [...first.indexes].reverse() };
  assert.equal(canonicalIndexSpec(first), canonicalIndexSpec(second));
});

test("index comparison removes only implicit Standard-edition export defaults", () => {
  const tagged = {
    indexes: [{
      collectionGroup: "trackers",
      queryScope: "COLLECTION",
      fields: [{ fieldPath: "epoch", order: "ASCENDING" }],
    }],
    fieldOverrides: [{ collectionGroup: "trackers", fieldPath: "days", indexes: [] }],
  };
  const deployed = {
    indexes: [{
      collectionGroup: "trackers",
      queryScope: "COLLECTION",
      apiScope: "ANY_API",
      density: "SPARSE_ALL",
      multikey: false,
      fields: [
        { fieldPath: "epoch", order: "ASCENDING" },
        { fieldPath: "__name__", order: "ASCENDING" },
      ],
    }],
    fieldOverrides: [{
      collectionGroup: "trackers",
      fieldPath: "days",
      ttl: false,
      indexes: [],
    }],
  };
  assert.equal(canonicalIndexSpec(tagged), canonicalIndexSpec(deployed));
  deployed.fieldOverrides[0].ttl = true;
  assert.notEqual(canonicalIndexSpec(tagged), canonicalIndexSpec(deployed));
});

test("tagged release hashes include Rules, indexes, and every public file", () => {
  const hashes = taggedConfigHashes();
  assert.match(hashes.rulesetSha256, /^[a-f0-9]{64}$/);
  assert.match(hashes.indexesSha256, /^[a-f0-9]{64}$/);
  assert.match(hashes.bundleSha256, /^[a-f0-9]{64}$/);
});

test("release script gates before deploy and publish verifies all tagged hashes", () => {
  const deploy = fs.readFileSync("scripts/release-deploy.mjs", "utf8");
  assert.ok(deploy.indexOf("— successful tag gate") < deploy.indexOf("— deploy Firestore rules/indexes"));
  const workflow = fs.readFileSync(".github/workflows/release.yml", "utf8");
  for (const input of [
    "gate_run_id",
    "bundle_sha256",
    "ruleset_sha256",
    "indexes_sha256",
    "preflight_sha256",
  ]) {
    assert.ok(workflow.includes(`${input}:`), input);
  }
  assert.ok(workflow.includes("node scripts/release-hashes.mjs --verify"));
});
