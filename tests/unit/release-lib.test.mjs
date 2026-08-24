import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AI_GENERATE_CONTENT_QUOTA_ID,
  AI_GENERATE_CONTENT_QUOTA_METRIC,
  FIRESTORE_RULES_RELEASE,
  AI_LOG_EXCLUSION,
  AI_P4SA,
  AI_QUOTA_DIMENSIONS_INFO_COUNT,
  AI_QUOTA_GROUPED_APPLICABLE_LOCATIONS,
  AI_QUOTA_NAMED_REGIONS,
  AI_REQUIRED_SPOT_CHECKS,
  AI_ROLLOUT_STAGES,
  PRODUCTION_HOSTS,
  PROJECT_ID,
  activeFirebaseProject,
  canonicalIndexSpec,
  clientAiEnabledFromIndexHtml,
  matchingValidationRuns,
  releaseVerificationProblems,
  taggedConfigHashes,
} from "../../scripts/release-lib.mjs";

const TAG = "v3.7.0";
const COMMIT = "a".repeat(40);
const MODEL = "gemini-3.5-flash-lite";
const NOW = Date.parse("2026-08-23T12:00:00.000Z");
const indexHtml = (enabled) =>
  `<script type="module">window.AI_ENABLED=${enabled};</script>`;

function quotaInventory(limit) {
  return {
    metric: AI_GENERATE_CONTENT_QUOTA_METRIC,
    quotaId: AI_GENERATE_CONTENT_QUOTA_ID,
    dimensionsInfos: [
      ...AI_QUOTA_NAMED_REGIONS.map((region) => ({
        region,
        applicableLocations: [],
        limit,
      })),
      {
        region: null,
        applicableLocations: [...AI_QUOTA_GROUPED_APPLICABLE_LOCATIONS],
        limit,
      },
    ],
  };
}

function validVerification({ enabled = false, tag = TAG } = {}) {
  return {
    schemaVersion: 3,
    stage: enabled ? AI_ROLLOUT_STAGES.enabled : AI_ROLLOUT_STAGES.disabled,
    projectId: PROJECT_ID,
    tag,
    commitSha: COMMIT,
    verifiedAt: "2026-08-23T11:00:00.000Z",
    firebasePlan: "Spark",
    billingAccountLinked: false,
    maxObservedQuotaPercent: 65,
    productionHosts: PRODUCTION_HOSTS,
    appCheck: {
      firestoreEnforced: true,
      aiLogicEnforced: enabled,
      bothHostsVerified: enabled,
    },
    model: MODEL,
    modelAvailableWithoutBilling: true,
    aiLogic: {
      authenticatedUsersRequired: enabled,
      authenticatedSuccessVerified: enabled,
      unauthenticated401Verified: enabled,
      invalidAppCheck403Verified: enabled,
      generateContentRpmPerUserQuota: quotaInventory(enabled ? 6 : 100),
      freeTierBackendQuotas: {
        rpmPerProjectModel: 15,
        rpdPerProjectModel: 500,
        inputTpmPerProjectModel: 250000,
        inputTpdPerProjectModel: "unlimited-or-unspecified",
      },
      telemetryMode: "NONE",
      telemetrySamplingRate: 1,
      p4saEmail: AI_P4SA,
      p4saRole: "roles/firebaseml.serviceAgent",
      usesP4saForAuthorization: true,
      serverSideGeminiKeyObfuscated: true,
      geminiDeveloperApiKeyEmbedded: false,
      publicBrowserKeyAllowsGenerativeLanguage: false,
      obsoleteGeminiKeyHasRecentConsumers: false,
      spotChecks: {
        calorieReferencePassed: enabled,
        latencyCompared: enabled,
        localhostDebugTokenPassed: enabled,
        productionHostsPassed: enabled ? PRODUCTION_HOSTS : [],
        completedAt: enabled ? "2026-08-23T10:00:00.000Z" : null,
      },
    },
    logging: {
      exclusionEnabled: enabled,
      exclusionFilter: enabled ? AI_LOG_EXCLUSION : null,
      exclusionActivatedAt: enabled ? "2026-08-23T10:00:00.000Z" : null,
      defaultBucketRetentionDays: 30,
      existingModelLogsExpireAt: enabled ? "2026-09-22T10:00:00.000Z" : null,
      aggregateMetricsRemainAvailable: true,
      exportsConfigured: false,
    },
    aiEnablementTargets: {
      model: MODEL,
      productionHosts: PRODUCTION_HOSTS,
      appCheckAiLogicEnforced: true,
      authenticatedUsersRequired: true,
      generateContentRpmPerUserQuota: {
        metric: AI_GENERATE_CONTENT_QUOTA_METRIC,
        quotaId: AI_GENERATE_CONTENT_QUOTA_ID,
        requiredDimensionsInfoCount: AI_QUOTA_DIMENSIONS_INFO_COUNT,
        namedRegions: AI_QUOTA_NAMED_REGIONS,
        groupedApplicableLocations: AI_QUOTA_GROUPED_APPLICABLE_LOCATIONS,
        limitPerBucket: 6,
      },
      logExclusionFilter: AI_LOG_EXCLUSION,
      requiredSpotChecks: AI_REQUIRED_SPOT_CHECKS,
    },
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

test("AI-disabled rollout accepts the observed baseline and exact enablement targets", () => {
  assert.deepEqual(
    releaseVerificationProblems(validVerification(), {
      tag: TAG,
      commitSha: COMMIT,
      model: MODEL,
      indexHtml: indexHtml(false),
      now: NOW,
    }),
    [],
  );
  const invalid = validVerification();
  invalid.billingAccountLinked = true;
  invalid.appCheck.aiLogicEnforced = true;
  invalid.maxObservedQuotaPercent = 71;
  const problems = releaseVerificationProblems(invalid, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(false),
    now: NOW,
  });
  assert.ok(problems.some((problem) => problem.includes("no Cloud Billing")));
  assert.ok(problems.some((problem) => problem.includes("preconfiguration AI App Check")));
  assert.ok(problems.some((problem) => problem.includes("between 0 and 70")));
});

test("AI-enabled rollout requires and accepts the full hardened posture", () => {
  const enabledTag = "v3.7.1";
  assert.deepEqual(
    releaseVerificationProblems(validVerification({ enabled: true, tag: enabledTag }), {
      tag: enabledTag,
      commitSha: COMMIT,
      model: MODEL,
      indexHtml: indexHtml(true),
      now: NOW,
    }),
    [],
  );
  const baseline = validVerification({ tag: enabledTag });
  const problems = releaseVerificationProblems(baseline, {
    tag: enabledTag,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(true),
    now: NOW,
  });
  for (const marker of [
    "stage",
    "App Check enforcement",
    "authenticated-users",
    "39 location buckets",
    "spot-check evidence",
    "log-body exclusion",
    "canonical ISO existingModelLogsExpireAt",
  ]) assert.ok(problems.some((problem) => problem.includes(marker)), marker);
});

test("enabled logging evidence requires current canonical activation and exact retention expiry", () => {
  const enabledTag = "v3.7.1";
  const problemsFor = (mutate) => {
    const record = validVerification({ enabled: true, tag: enabledTag });
    mutate(record.logging);
    return releaseVerificationProblems(record, {
      tag: enabledTag,
      commitSha: COMMIT,
      model: MODEL,
      indexHtml: indexHtml(true),
      now: NOW,
    });
  };
  const old = problemsFor((logging) => {
    logging.exclusionActivatedAt = "1970-01-01T00:00:00.000Z";
    logging.existingModelLogsExpireAt = "1970-01-31T00:00:00.000Z";
  });
  assert.ok(old.some((problem) => problem.includes("within 24 hours")));
  assert.ok(old.some((problem) => problem.includes("still be in the future")));

  const noncanonicalActivation = problemsFor((logging) => {
    logging.exclusionActivatedAt = "2026-08-23 10:00:00Z";
  });
  assert.ok(noncanonicalActivation.some((problem) =>
    problem.includes("canonical ISO exclusionActivatedAt")));

  const noncanonicalExpiry = problemsFor((logging) => {
    logging.existingModelLogsExpireAt = "2026-09-22T10:00:00Z";
  });
  assert.ok(noncanonicalExpiry.some((problem) =>
    problem.includes("canonical ISO existingModelLogsExpireAt")));

  const future = problemsFor((logging) => {
    logging.exclusionActivatedAt = "2026-08-23T11:30:00.000Z";
    logging.existingModelLogsExpireAt = "2026-09-22T11:30:00.000Z";
  });
  assert.ok(future.some((problem) => problem.includes("cannot be after")));

  const inconsistent = problemsFor((logging) => {
    logging.existingModelLogsExpireAt = "2026-09-22T09:59:59.999Z";
  });
  assert.ok(inconsistent.some((problem) => problem.includes("plus the 30-day")));
});

test("release stage is derived from one literal flag in the tagged index bytes", () => {
  assert.equal(clientAiEnabledFromIndexHtml(indexHtml(false)), false);
  assert.equal(clientAiEnabledFromIndexHtml(indexHtml(true)), true);
  assert.equal(clientAiEnabledFromIndexHtml("window.AI_ENABLED=flag;"), null);
  assert.equal(
    clientAiEnabledFromIndexHtml(`${indexHtml(false)}${indexHtml(true)}`),
    null,
  );
  const mismatched = validVerification();
  mismatched.stage = AI_ROLLOUT_STAGES.enabled;
  const problems = releaseVerificationProblems(mismatched, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(false),
    now: NOW,
  });
  assert.ok(problems.some((problem) => problem.includes("stage must match")));
});

test("quota evidence pins the non-bidi metric, quotaId, and every location bucket", () => {
  const variants = [
    (quota) => { quota.metric = quota.metric.replace("generate_content", "generate_content_bidi"); },
    (quota) => { quota.quotaId = `Bidi${quota.quotaId}`; },
    (quota) => { quota.dimensionsInfos.pop(); },
    (quota) => { quota.dimensionsInfos[0].region = "region-01"; },
    (quota) => { quota.dimensionsInfos[1].region = quota.dimensionsInfos[0].region; },
    (quota) => { quota.dimensionsInfos.at(-1).applicableLocations = []; },
    (quota) => { quota.dimensionsInfos.at(-1).applicableLocations[0] = "future-region1"; },
  ];
  for (const mutate of variants) {
    const record = validVerification();
    mutate(record.aiLogic.generateContentRpmPerUserQuota);
    const problems = releaseVerificationProblems(record, {
      tag: TAG,
      commitSha: COMMIT,
      model: MODEL,
      indexHtml: indexHtml(false),
      now: NOW,
    });
    assert.ok(problems.some((problem) => problem.includes("metric/quotaId")));
  }
});

test("stale or unbound release verification is rejected", () => {
  const stale = validVerification();
  stale.verifiedAt = "2026-08-20T11:00:00.000Z";
  stale.commitSha = "b".repeat(40);
  const problems = releaseVerificationProblems(stale, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(false),
    now: NOW,
  });
  assert.ok(problems.some((problem) => problem.includes("commitSha")));
  assert.ok(problems.some((problem) => problem.includes("older than 24 hours")));
});

test("AI release posture fails closed on auth mode, quota, key, host, and logging drift", () => {
  const enabledTag = "v3.7.1";
  const invalid = validVerification({ enabled: true, tag: enabledTag });
  invalid.productionHosts = [PRODUCTION_HOSTS[0]];
  invalid.aiLogic.authenticatedUsersRequired = false;
  invalid.aiLogic.generateContentRpmPerUserQuota.dimensionsInfos[0].limit = 100;
  invalid.aiLogic.p4saEmail = "wrong@example.invalid";
  invalid.aiLogic.publicBrowserKeyAllowsGenerativeLanguage = true;
  invalid.aiLogic.spotChecks.productionHostsPassed = [PRODUCTION_HOSTS[0]];
  invalid.logging.exclusionFilter = "resource.type=wrong";
  invalid.logging.existingModelLogsExpireAt = "unknown";
  const problems = releaseVerificationProblems(invalid, {
    tag: enabledTag,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(true),
    now: NOW,
  });
  for (const marker of [
    "production hosts",
    "authenticated-users",
    "39 location buckets",
    "P4SA",
    "Generative Language",
    "spot-check evidence",
    "log-body exclusion",
    "canonical ISO existingModelLogsExpireAt",
  ]) assert.ok(problems.some((problem) => problem.includes(marker)), marker);
});

test("checked-in release verification template fails closed", () => {
  const template = JSON.parse(
    fs.readFileSync("docs/release-verification.example.json", "utf8"),
  );
  const problems = releaseVerificationProblems(template, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(false),
    now: NOW,
  });
  for (const marker of [
    "tag",
    "commitSha",
    "verifiedAt",
    "firebasePlan",
    "Cloud Billing",
    "maxObservedQuotaPercent",
    "39 preconfiguration location buckets",
  ]) {
    assert.ok(problems.some((problem) => problem.includes(marker)), marker);
  }
});

test("a current record completed from the template can deploy the disabled rollout", () => {
  const record = JSON.parse(
    fs.readFileSync("docs/release-verification.example.json", "utf8"),
  );
  Object.assign(record, {
    tag: TAG,
    commitSha: COMMIT,
    verifiedAt: "2026-08-23T11:00:00.000Z",
    firebasePlan: "Spark",
    billingAccountLinked: false,
    maxObservedQuotaPercent: 65,
  });
  record.aiLogic.generateContentRpmPerUserQuota.dimensionsInfos =
    quotaInventory(100).dimensionsInfos;
  assert.deepEqual(releaseVerificationProblems(record, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(false),
    now: NOW,
  }), []);
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
  assert.ok(deploy.includes("indexHtml: html"));
  assert.ok(deploy.includes("local/releases/${tag}-manifest.json"));
  assert.ok(!deploy.includes("docs/releases"));
});

test("activeFirebaseProject parses the labelled firebase use formats", () => {
  assert.equal(activeFirebaseProject("Active Project: diet-tracker-372ca\n"), PROJECT_ID);
  assert.equal(activeFirebaseProject("Now using project diet-tracker-372ca\n"), PROJECT_ID);
});

test("activeFirebaseProject parses the bare firebase-tools 15 output", () => {
  assert.equal(activeFirebaseProject("diet-tracker-372ca\n"), PROJECT_ID);
  assert.equal(activeFirebaseProject("diet-tracker-372ca"), PROJECT_ID);
});

test("activeFirebaseProject fails closed on anything else", () => {
  assert.equal(activeFirebaseProject(""), null);
  assert.equal(activeFirebaseProject(undefined), null);
  assert.equal(activeFirebaseProject("Warning: deprecated\ndiet-tracker-372ca\nother-id\n"), null);
  assert.equal(activeFirebaseProject("Active Project: wrong-project\n"), "wrong-project");
});
