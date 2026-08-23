import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  FIRESTORE_RULES_RELEASE,
  PROJECT_ID,
  canonicalIndexSpec,
  matchingValidationRuns,
  releaseVerificationProblems,
  taggedConfigHashes,
} from "../../scripts/release-lib.mjs";

const TAG = "v3.6.0";
const COMMIT = "a".repeat(40);
const MODEL = "gemini-flash-lite-latest";
const NOW = Date.parse("2026-08-23T12:00:00.000Z");

function validVerification() {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    tag: TAG,
    commitSha: COMMIT,
    verifiedAt: "2026-08-23T11:00:00.000Z",
    firebasePlan: "Spark",
    billingAccountLinked: false,
    maxObservedQuotaPercent: 65,
    appCheckVerified: true,
    model: MODEL,
    modelAvailableWithoutBilling: true,
  };
}

test("release verification uses Firebase's default Firestore release name", () => {
  assert.equal(
    FIRESTORE_RULES_RELEASE,
    `projects/${PROJECT_ID}/releases/cloud.firestore`,
  );
});

test("only the exact successful tag validation run matches", () => {
  const good = {
    databaseId: 42,
    workflowName: "release",
    headBranch: TAG,
    headSha: COMMIT,
    event: "push",
    status: "completed",
    conclusion: "success",
  };
  assert.deepEqual(matchingValidationRuns([good], TAG, COMMIT), [good]);
  for (const change of [
    { workflowName: "quality" },
    { headBranch: "v3.5.1" },
    { headSha: "b".repeat(40) },
    { event: "workflow_dispatch" },
    { status: "in_progress" },
    { conclusion: "failure" },
  ]) {
    assert.deepEqual(matchingValidationRuns([{ ...good, ...change }], TAG, COMMIT), []);
  }
});

test("release verification requires current Firebase settings", () => {
  assert.deepEqual(
    releaseVerificationProblems(validVerification(), {
      tag: TAG,
      commitSha: COMMIT,
      model: MODEL,
      now: NOW,
    }),
    [],
  );
  const invalid = validVerification();
  invalid.billingAccountLinked = true;
  invalid.appCheckVerified = false;
  invalid.maxObservedQuotaPercent = 71;
  const problems = releaseVerificationProblems(invalid, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    now: NOW,
  });
  assert.ok(problems.some((problem) => problem.includes("no Cloud Billing")));
  assert.ok(problems.some((problem) => problem.includes("App Check")));
  assert.ok(problems.some((problem) => problem.includes("between 0 and 70")));
});

test("stale or unbound release verification is rejected", () => {
  const stale = validVerification();
  stale.verifiedAt = "2026-08-20T11:00:00.000Z";
  stale.commitSha = "b".repeat(40);
  const problems = releaseVerificationProblems(stale, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    now: NOW,
  });
  assert.ok(problems.some((problem) => problem.includes("commitSha")));
  assert.ok(problems.some((problem) => problem.includes("older than 24 hours")));
});

test("checked-in release verification template fails closed", () => {
  const template = JSON.parse(
    fs.readFileSync("docs/release-verification.example.json", "utf8"),
  );
  const problems = releaseVerificationProblems(template, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    now: NOW,
  });
  for (const marker of [
    "tag",
    "commitSha",
    "verifiedAt",
    "firebasePlan",
    "Cloud Billing",
    "maxObservedQuotaPercent",
    "App Check",
    "without billing",
  ]) {
    assert.ok(problems.some((problem) => problem.includes(marker)), marker);
  }
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

test("release script validates before deploy and publish verifies all tagged hashes", () => {
  const deploy = fs.readFileSync("scripts/release-deploy.mjs", "utf8");
  assert.ok(
    deploy.indexOf("— successful tag validation") <
      deploy.indexOf("— deploy Firestore rules/indexes"),
  );
  const workflow = fs.readFileSync(".github/workflows/release.yml", "utf8");
  for (const input of [
    "validation_run_id",
    "bundle_sha256",
    "ruleset_sha256",
    "indexes_sha256",
    "verification_sha256",
  ]) {
    assert.ok(workflow.includes(`${input}:`), input);
  }
  assert.ok(workflow.includes("node scripts/release-hashes.mjs --verify"));
  assert.ok(deploy.includes("local/release-verification-${tag}.json"));
  assert.ok(deploy.includes("local/releases/${tag}-manifest.json"));
  assert.ok(!deploy.includes("docs/releases"));
});
