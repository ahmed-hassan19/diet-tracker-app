import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AI_CONFIGURATION_STATES,
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
  releaseVerificationProblems as validateVerification,
  qualificationConfigurationHash,
  qualificationInputsHash,
  matchingQualityRuns,
  postDeploymentProblems,
  taggedConfigHashes,
} from "../../scripts/release-lib.mjs";

const TAG = "v3.13.0";
const COMMIT = "a".repeat(40);
const MODEL = "gemini-flash-lite-latest";
const NOW = Date.parse("2026-08-23T12:00:00.000Z");
const indexHtml = (enabled) =>
  `<script type="module">window.AI_ENABLED=${enabled};</script>`;

const INPUTS = "b".repeat(64);
function releaseVerificationProblems(record, context) {
  return validateVerification(record, {qualificationComparison: {
    auditedCommit: COMMIT, releaseCommit: COMMIT, ancestor: true,
    inputsSha256: INPUTS, allInterveningInputsMatch: true,
  }, ...context});
}
function extendVerification(record) {
  record.schemaVersion = 7;
  const probes = {};
  for (const key of ["authenticatedSuccessVerified", "unauthenticated401Verified",
    "invalidAppCheckRejectionVerified", "invalidAppCheckObservedHttpStatus"]) {
    probes[key] = record.aiLogic[key]; delete record.aiLogic[key];
  }
  record.qualification = {auditedAt: "2026-08-23T10:00:00.000Z", commitSha: COMMIT,
    inputsSha256: INPUTS, modelAliasTarget: null, probes, spotChecks: record.aiLogic.spotChecks};
  delete record.aiLogic.spotChecks;
  record.modelAliasTarget = null;
  record.qualificationFailureDetected = false;
  record.qualificationDiffReview = {auditedCommitSha:COMMIT,releaseCommitSha:COMMIT,
    reviewedAt:"2026-08-23T10:00:00.000Z",noRelevantBehaviorChanges:true};
  record.postDeployment = null;
  record.qualification.configurationSha256 = qualificationConfigurationHash(record);
  return record;
}

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

function validVerification({ enabled = false, hardened = false, tag = TAG } = {}) {
  const configured = enabled || hardened;
  return extendVerification({
    schemaVersion: 6,
    stage: enabled ? AI_ROLLOUT_STAGES.enabled : AI_ROLLOUT_STAGES.disabled,
    configurationState: enabled ? AI_CONFIGURATION_STATES.enabled :
      hardened ? AI_CONFIGURATION_STATES.disabledHardenedRejection :
        AI_CONFIGURATION_STATES.disabledPreconfiguration,
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
      aiLogicEnforced: configured,
      bothHostsVerified: configured,
    },
    model: MODEL,
    modelAvailableWithoutBilling: true,
    aiLogic: {
      authenticatedUsersRequired: configured,
      authenticatedSuccessVerified: configured,
      unauthenticated401Verified: configured,
      invalidAppCheckRejectionVerified: configured,
      invalidAppCheckObservedHttpStatus: enabled ? 403 : hardened ? 401 : null,
      generateContentRpmPerUserQuota: quotaInventory(configured ? 6 : 100),
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
        calorieReferencePassed: configured,
        latencyCompared: configured,
        localhostDebugTokenPassed: configured,
        productionHostsPassed: configured ? PRODUCTION_HOSTS : [],
        completedAt: configured ? "2026-08-23T10:00:00.000Z" : null,
      },
    },
    logging: {
      exclusionDisabled: configured ? false : null,
      exclusionFilter: configured ? AI_LOG_EXCLUSION : null,
      exclusionCreatedAt: configured ? "2025-01-01T00:00:00.000Z" : null,
      exclusionUpdatedAt: configured ? "2025-02-01T00:00:00.000Z" : null,
      exclusionVerifiedAt: configured ? "2026-08-23T10:00:00.000Z" : null,
      defaultBucketRetentionDays: 30,
      existingModelLogsExpireAt: configured ? "2025-03-03T00:00:00.000Z" : null,
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
  });
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

test("preconfiguration AI-disabled rollout accepts its baseline and exact enablement targets", () => {
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
  assert.ok(problems.some((problem) => problem.includes("AI App Check baseline")));
  assert.ok(problems.some((problem) => problem.includes("between 0 and 70")));
});

test("hardened AI-disabled rollout accepts paired invalid-App-Check rejection with 401 or 403", () => {
  const hardenedTag = "v3.13.1";
  for (const status of [401, 403]) {
    const record = validVerification({ hardened: true, tag: hardenedTag });
    record.qualification.probes.invalidAppCheckObservedHttpStatus = status;
    assert.deepEqual(releaseVerificationProblems(record, {
      tag: hardenedTag,
      commitSha: COMMIT,
      model: MODEL,
      indexHtml: indexHtml(false),
      now: NOW,
    }), []);
  }
});

test("hardened AI-disabled rollout rejects contradictory status claims and stale evidence", () => {
  const hardenedTag = "v3.13.1";
  const invalid = validVerification({ hardened: true, tag: hardenedTag });
  invalid.qualification.probes.invalidAppCheckRejectionVerified = false;
  invalid.qualification.probes.invalidAppCheckObservedHttpStatus = 200;
  invalid.qualification.spotChecks.completedAt = "2026-08-20T10:00:00.000Z";
  invalid.appCheck.firestoreEnforced = false;
  invalid.appCheck.bothHostsVerified = false;
  invalid.qualification.probes.authenticatedSuccessVerified = false;
  invalid.aiLogic.generateContentRpmPerUserQuota.dimensionsInfos[0].limit = 100;
  invalid.aiLogic.p4saEmail = "wrong@example.invalid";
  invalid.aiLogic.telemetryMode = "FULL";
  invalid.aiLogic.publicBrowserKeyAllowsGenerativeLanguage = true;
  invalid.maxObservedQuotaPercent = 71;
  invalid.logging.exclusionVerifiedAt = "2026-08-20T10:00:00.000Z";
  const problems = releaseVerificationProblems(invalid, {
    tag: hardenedTag,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(false),
    now: NOW,
  });
  for (const marker of [
    "paired valid-App-Check success",
    "spot-check evidence",
    "Firestore App Check",
    "both production hosts",
    "authenticated AI success",
    "39 location buckets",
    "P4SA",
    "telemetry mode NONE",
    "Generative Language",
    "between 0 and 70",
    "within 24 hours",
  ]) assert.ok(problems.some((problem) => problem.includes(marker)), marker);
});

test("AI-enabled rollout requires and accepts the full hardened posture", () => {
  const enabledTag = "v3.13.0";
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
    "configurationState",
    "App Check enforcement",
    "authenticated-users",
    "39 location buckets",
    "spot-check evidence",
    "log-body exclusion",
    "canonical ISO existingModelLogsExpireAt",
  ]) assert.ok(problems.some((problem) => problem.includes(marker)), marker);
});

test("AI-enabled rollout accepts 401 or 403 and rejects missing, successful, or other invalid-App-Check status", () => {
  const enabledTag = "v3.13.0";
  for (const status of [401, 403]) {
    const record = validVerification({ enabled: true, tag: enabledTag });
    record.qualification.probes.invalidAppCheckObservedHttpStatus = status;
    assert.deepEqual(releaseVerificationProblems(record, {
      tag: enabledTag,
      commitSha: COMMIT,
      model: MODEL,
      indexHtml: indexHtml(true),
      now: NOW,
    }), []);
  }
  for (const status of [null, 200, 400, 402, 404, 429, 500]) {
    const record = validVerification({ enabled: true, tag: enabledTag });
    record.qualification.probes.invalidAppCheckObservedHttpStatus = status;
    const problems = releaseVerificationProblems(record, {
      tag: enabledTag,
      commitSha: COMMIT,
      model: MODEL,
      indexHtml: indexHtml(true),
      now: NOW,
    });
    assert.ok(problems.some((problem) =>
      problem.includes("observing exactly 401 or 403")), status);
  }
  const missingEvidence = validVerification({ enabled: true, tag: enabledTag });
  missingEvidence.qualification.probes.invalidAppCheckRejectionVerified = false;
  assert.ok(releaseVerificationProblems(missingEvidence, {
    tag: enabledTag,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(true),
    now: NOW,
  }).some((problem) => problem.includes("paired valid-App-Check success")));
});

test("enabled logging evidence requires the current authoritative exclusion resource", () => {
  const enabledTag = "v3.13.0";
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
  const staleVerification = problemsFor((logging) => {
    logging.exclusionVerifiedAt = "2026-08-20T10:00:00.000Z";
  });
  assert.ok(staleVerification.some((problem) => problem.includes("within 24 hours")));
  assert.ok(staleVerification.some((problem) => problem.includes("older than 24 hours")));

  const noncanonicalCreated = problemsFor((logging) => {
    logging.exclusionCreatedAt = "2025-01-01 00:00:00Z";
  });
  assert.ok(noncanonicalCreated.some((problem) =>
    problem.includes("canonical ISO exclusionCreatedAt")));

  const noncanonicalUpdated = problemsFor((logging) => {
    logging.exclusionUpdatedAt = "2025-02-01T00:00:00Z";
  });
  assert.ok(noncanonicalUpdated.some((problem) =>
    problem.includes("canonical ISO exclusionUpdatedAt")));

  const noncanonicalVerified = problemsFor((logging) => {
    logging.exclusionVerifiedAt = "2026-08-23T10:00:00Z";
  });
  assert.ok(noncanonicalVerified.some((problem) =>
    problem.includes("canonical ISO exclusionVerifiedAt")));

  const noncanonicalExpiry = problemsFor((logging) => {
    logging.existingModelLogsExpireAt = "2026-09-22T10:00:00Z";
  });
  assert.ok(noncanonicalExpiry.some((problem) =>
    problem.includes("canonical ISO existingModelLogsExpireAt")));

  const future = problemsFor((logging) => {
    logging.exclusionCreatedAt = "2026-08-23T11:30:00.000Z";
    logging.exclusionUpdatedAt = "2026-08-23T11:31:00.000Z";
    logging.exclusionVerifiedAt = "2026-08-23T11:32:00.000Z";
    logging.existingModelLogsExpireAt = "2026-09-22T11:31:00.000Z";
  });
  assert.ok(future.some((problem) => problem.includes("cannot be after")));

  const futureDated = problemsFor((logging) => {
    logging.exclusionCreatedAt = "2026-08-23T12:01:00.000Z";
    logging.exclusionUpdatedAt = "2026-08-23T12:02:00.000Z";
    logging.exclusionVerifiedAt = "2026-08-23T12:03:00.000Z";
    logging.existingModelLogsExpireAt = "2026-09-22T12:02:00.000Z";
  });
  assert.ok(futureDated.some((problem) => problem.includes("in the future")));

  const reversedCreation = problemsFor((logging) => {
    logging.exclusionCreatedAt = "2025-02-02T00:00:00.000Z";
  });
  assert.ok(reversedCreation.some((problem) => problem.includes("createTime")));

  const staleResourceSnapshot = problemsFor((logging) => {
    logging.exclusionUpdatedAt = "2026-08-23T10:30:00.000Z";
    logging.existingModelLogsExpireAt = "2025-03-03T00:00:00.000Z";
  });
  assert.ok(staleResourceSnapshot.some((problem) =>
    problem.includes("plus the 30-day")));

  const inconsistent = problemsFor((logging) => {
    logging.existingModelLogsExpireAt = "2025-03-02T23:59:59.999Z";
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
  const enabledTag = "v3.13.0";
  const invalid = validVerification({ enabled: true, tag: enabledTag });
  invalid.productionHosts = [PRODUCTION_HOSTS[0]];
  invalid.aiLogic.authenticatedUsersRequired = false;
  invalid.aiLogic.generateContentRpmPerUserQuota.dimensionsInfos[0].limit = 100;
  invalid.aiLogic.p4saEmail = "wrong@example.invalid";
  invalid.aiLogic.publicBrowserKeyAllowsGenerativeLanguage = true;
  invalid.qualification.spotChecks.productionHostsPassed = [PRODUCTION_HOSTS[0]];
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
    indexHtml: indexHtml(true),
    now: NOW,
  });
  for (const marker of [
    "tag",
    "commitSha",
    "verifiedAt",
    "firebasePlan",
    "Cloud Billing",
    "maxObservedQuotaPercent",
    "39 location buckets at exactly 6",
  ]) {
    assert.ok(problems.some((problem) => problem.includes(marker)), marker);
  }
});

test("a current schema-7 record completed from the template can deploy the enabled rollout", () => {
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
  Object.assign(record.appCheck, {
    aiLogicEnforced: true,
    bothHostsVerified: true,
  });
  record.aiLogic.authenticatedUsersRequired = true;
  Object.assign(record.qualification.probes, {
    authenticatedSuccessVerified: true,
    unauthenticated401Verified: true,
    invalidAppCheckRejectionVerified: true,
    invalidAppCheckObservedHttpStatus: 401,
  });
  record.aiLogic.generateContentRpmPerUserQuota.dimensionsInfos =
    quotaInventory(6).dimensionsInfos;
  Object.assign(record.qualification.spotChecks, {
    calorieReferencePassed: true,
    latencyCompared: true,
    localhostDebugTokenPassed: true,
    productionHostsPassed: PRODUCTION_HOSTS,
    completedAt: "2026-08-23T10:00:00.000Z",
  });
  Object.assign(record.logging, {
    exclusionDisabled: false,
    exclusionFilter: AI_LOG_EXCLUSION,
    exclusionCreatedAt: "2025-01-01T00:00:00.000Z",
    exclusionUpdatedAt: "2025-02-01T00:00:00.000Z",
    exclusionVerifiedAt: "2026-08-23T10:00:00.000Z",
    existingModelLogsExpireAt: "2025-03-03T00:00:00.000Z",
  });
  Object.assign(record.qualification, {auditedAt: "2026-08-23T10:00:00.000Z",
    commitSha: COMMIT, inputsSha256: INPUTS, configurationSha256: qualificationConfigurationHash(record)});
  record.qualificationFailureDetected = false;
  record.qualificationDiffReview = {auditedCommitSha:COMMIT,releaseCommitSha:COMMIT,
    reviewedAt:"2026-08-23T10:00:00.000Z",noRelevantBehaviorChanges:true};
  assert.deepEqual(releaseVerificationProblems(record, {
    tag: TAG,
    commitSha: COMMIT,
    model: MODEL,
    indexHtml: indexHtml(true),
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

test("publication records the verified commit as the current production deployment", () => {
  const workflow = fs.readFileSync(".github/workflows/release.yml", "utf8");
  const publish = workflow.indexOf("Publish GitHub Release with the deployment summary");
  const deployment = workflow.indexOf("Record verified production deployment");
  assert.ok(publish >= 0 && deployment > publish);
  for (const marker of [
    "deployments: write",
    'select(.sha == $commit and .environment == "production")',
    'environment:"production"',
    'production_environment:true',
    'state:"success"',
    'auto_inactive:true',
    "https://diet-tracker-372ca.web.app",
  ]) assert.ok(workflow.includes(marker), marker);
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

test("quality evidence binds repository, workflow identity, push main, and exact successful SHA", () => {
  const repository = "owner/diet";
  const good = {repository: {full_name: repository}, head_repository: {full_name: repository},
    workflow_id: 42, path: ".github/workflows/quality.yml", head_branch: "main",
    head_sha: COMMIT, event: "push", status: "completed", conclusion: "success"};
  assert.deepEqual(matchingQualityRuns([good], COMMIT, repository, 42), [good]);
  for (const patch of [{repository:{full_name:"other/diet"}}, {head_repository:{full_name:"fork/diet"}},
    {workflow_id:43}, {path:".github/workflows/impostor.yml"}, {head_branch:"feature/change"},
    {head_sha:"c".repeat(40)}, {event:"pull_request"}, {status:"in_progress"}, {conclusion:"failure"}])
    assert.deepEqual(matchingQualityRuns([{...good,...patch}],COMMIT,repository,42), [], JSON.stringify(patch));
  assert.deepEqual(matchingQualityRuns([],COMMIT,repository,42), []);
});

test("qualification reuses an original 30-day audit but blocks expiry, changed inputs, and failures", () => {
  const context = {tag:TAG,commitSha:COMMIT,model:MODEL,indexHtml:indexHtml(true),now:NOW};
  const good = validVerification({enabled:true});
  good.qualification.auditedAt = "2026-08-01T10:00:00.000Z";
  good.qualification.spotChecks.completedAt = good.qualification.auditedAt;
  assert.deepEqual(releaseVerificationProblems(good,context), []);
  for (const mutate of [
    r=>{r.qualification.auditedAt="2026-07-23T10:00:00.000Z";r.qualification.spotChecks.completedAt=r.qualification.auditedAt;},
    r=>{r.qualification.auditedAt="2026-08-24T10:00:00.000Z";},
    r=>{r.qualification.spotChecks.completedAt="2026-08-02T10:00:00.000Z";},
    r=>{r.qualification.configurationSha256="d".repeat(64);},
    r=>{r.qualification.inputsSha256="d".repeat(64);},
    r=>{r.qualification.commitSha="d".repeat(40);},
    r=>{r.modelAliasTarget="gemini-target-new";r.qualification.modelAliasTarget="gemini-target-old";},
    r=>{r.qualificationFailureDetected=true;},
    r=>{r.qualification.probes.unauthenticated401Verified=false;},
    r=>{r.qualification.probes.authenticatedUsersRequired=true;r.aiLogic.authenticatedUsersRequired=false;},
    r=>{r.schemaVersion=6;},
    r=>{r.qualificationDiffReview.noRelevantBehaviorChanges=false;},
    r=>{r.qualificationDiffReview.releaseCommitSha="c".repeat(40);},
  ]) {
    const bad=structuredClone(good);mutate(bad);
    assert.ok(releaseVerificationProblems(bad,context).length,mutate.toString());
  }
  assert.ok(releaseVerificationProblems(good,{...context,qualificationComparison:null}).length);
  assert.ok(releaseVerificationProblems(good,{...context,qualificationComparison:{
    auditedCommit:COMMIT,releaseCommit:COMMIT,ancestor:true,inputsSha256:INPUTS,allInterveningInputsMatch:false,
  }}).length);
  // Unresolved is explicit absence of evidence, never a fabricated target string.
  good.modelAliasTarget=null;good.qualification.modelAliasTarget=null;
  assert.deepEqual(releaseVerificationProblems(good,context), []);
});

test("qualification fingerprints AI/Auth/security policy while permitting unrelated diet UI edits", () => {
  const read = file=>fs.readFileSync(file,"utf8");
  const original=qualificationInputsHash(read);
  for(const [file,from,to] of [
    ["public/index.html","<title>","<title>Diet "],
    ["public/render.js","function draftFood(label){","function draftFood(label){ /* diet-only */"],
    ["public/calc.js","function calcTargets(p){","function calcTargets(p){ /* diet formula */"],
  ]) {
    assert.ok(read(file).includes(from),file);
    assert.equal(qualificationInputsHash(f=>f===file?read(f).replace(from,to):read(f)),original,file);
  }
  for(const [file,from,to] of [
    ["public/index.html","window.AI_ENABLED=true","window.AI_ENABLED=false"],
    ["public/render.js","function aiOn(){","function aiOn(){ /* changed */"],
    ["public/render.js","async function aiCalRef(btn){","async function aiCalRef(btn){ /* changed */"],
    ["public/sync.js","function login(){","function login(){ /* changed */"],
    ["public/sync.js","function resetSyncContext(){","function resetSyncContext(){ /* changed */"],
    ["public/state.js","function normalizeSettings(","function normalizeSettingsChanged("],
    ["public/index.html",'<script src="./data.js">','<script src="./other.js">'],
    ["public/index.html",'<script src="./data.js">','<script>window.AI_ENABLED=false;</script><script src="./data.js">'],
    ["public/render.js","const SVG_NS=","function unexpectedSecurityCode(){}\nconst SVG_NS="],
    ["public/render.js","function saveFood(key){","window.firebaseBridge = null;\nfunction saveFood(key){"],
    ["public/render.js","function showTab(t){","function showTab(t){ window.AI_ENABLED=false;"],
    ["public/render.js","function showTab(t){","function showTab(t){ FB.active=false;"],
    ["public/render.js","function showTab(t){","function showTab(t){ KEY=null;"],
    ["public/render.js","function renderCalRef(){","function renderCalRef(){ return;"],
    ["public/sync.js","function mergeRemote(remote){","function mergeRemote(remote){ window.AI_ENABLED=false;"],
    ["public/state.js","function normalizeState(raw,source){","function normalizeState(raw,source){ window.AI_ENABLED=false;"],
    ["public/data.js",'const APP_VERSION=', 'window.AI_ENABLED=false;\nconst APP_VERSION='],
    ["public/calc.js",'function calcTargets(p){', 'window.AI_ENABLED=false;\nfunction calcTargets(p){'],
    ["scripts/release-lib.mjs","schemaVersion === 7","schemaVersion === 8"],
  ]) {
    assert.ok(read(file).includes(from),file);
    assert.notEqual(qualificationInputsHash(f=>f===file?read(f).replace(from,to):read(f)),original,file);
  }
});

test("post-deployment smoke requires fresh checks, cleanup, and signout on both hosts", () => {
  const context={now:NOW,deployedAt:"2026-08-23T10:00:00.000Z"};
  const good={completedAt:"2026-08-23T11:00:00.000Z",hosts:PRODUCTION_HOSTS.map(host=>({host,
    bootstrap:true,signIn:true,ownDataRead:true,ownDataWrite:true,aiDraftCancelled:true,
    consoleClean:true,testDataRestored:true,signedOut:true}))};
  assert.deepEqual(postDeploymentProblems(good,context),[]);
  for(const key of ["bootstrap","signIn","ownDataRead","ownDataWrite","aiDraftCancelled","consoleClean","testDataRestored","signedOut"]){
    const bad=structuredClone(good);bad.hosts[1][key]=false;
    assert.ok(postDeploymentProblems(bad,context).length,key);
  }
  assert.ok(postDeploymentProblems(null,context).length);
  assert.ok(postDeploymentProblems({...good,completedAt:"2026-08-23T09:00:00.000Z"},context).length);
  assert.ok(postDeploymentProblems({...good,completedAt:"2026-08-24T11:00:00.000Z"},context).length);
  const record=validVerification({enabled:true});
  assert.ok(releaseVerificationProblems(record,{tag:TAG,commitSha:COMMIT,model:MODEL,indexHtml:indexHtml(true),now:NOW,
    requirePostDeployment:true,deployedAt:context.deployedAt}).some(p=>p.includes("smoke")));
});

test("qualification comparison checks ancestry and reverted changes without inheriting Git hook state", async () => {
  const {mkdtempSync,cpSync,mkdirSync,writeFileSync,rmSync}=await import("node:fs");
  const {tmpdir}=await import("node:os");
  const path=await import("node:path");
  const {spawnSync}=await import("node:child_process");
  const {QUALIFICATION_FILES}=await import("../../scripts/release-lib.mjs");
  const scratch=mkdtempSync(path.join(tmpdir(),"diet-qualification-test-"));
  const root=path.join(scratch,"fixture"),parent=path.join(scratch,"protected-parent");
  mkdirSync(root);mkdirSync(parent);
  const cli=path.resolve("scripts/qualification-inputs.mjs");
  // cwd does not override GIT_DIR/GIT_INDEX_FILE exported by a real commit hook.
  // Remove the entire Git environment namespace for every fixture subprocess,
  // including Node children that themselves invoke Git.
  const cleanGitEnvironment=environment=>Object.fromEntries(
    Object.entries(environment).filter(([key])=>!key.startsWith("GIT_")),
  );
  const runGit=(cwd,args,environment=process.env)=>{
    const result=spawnSync("git",["-c","core.hooksPath=/dev/null",...args],{
      cwd,encoding:"utf8",env:cleanGitEnvironment(environment),
    });
    assert.equal(result.status,0,result.stderr);return result.stdout.trim();
  };
  try {
    runGit(parent,["init","--quiet"]);
    writeFileSync(path.join(parent,"sentinel.txt"),"Protected parent worktree\n");
    runGit(parent,["add","."]);
    runGit(parent,["-c","user.name=Test","-c","user.email=test@example.invalid",
      "commit","--quiet","-m","parent sentinel"]);
    const parentHead=runGit(parent,["rev-parse","HEAD"]);
    const parentIndex=fs.readFileSync(path.join(parent,".git/index"));
    const parentConfig=fs.readFileSync(path.join(parent,".git/config"));
    const hookEnvironment={...process.env,
      GIT_DIR:path.join(parent,".git"),GIT_COMMON_DIR:path.join(parent,".git"),
      GIT_WORK_TREE:parent,GIT_INDEX_FILE:path.join(parent,".git/index"),GIT_PREFIX:"nested/",
      GIT_OBJECT_DIRECTORY:path.join(parent,".git/objects"),
      GIT_CONFIG_COUNT:"1",GIT_CONFIG_KEY_0:"core.bare",GIT_CONFIG_VALUE_0:"true",
      GIT_CONFIG_PARAMETERS:"'user.name=Wrong'",GIT_CONFIG_GLOBAL:path.join(parent,".git/config"),
    };
    assert.ok(!Object.keys(cleanGitEnvironment(hookEnvironment)).some(key=>key.startsWith("GIT_")));
    const git=(...args)=>runGit(root,args,hookEnvironment);
    const compare=(a,b)=>spawnSync(process.execPath,[cli,a,b],{
      cwd:root,encoding:"utf8",env:cleanGitEnvironment(hookEnvironment),
    });
    for(const file of [...QUALIFICATION_FILES,"docs/development-contracts.md","public/index.html","public/render.js","public/state.js","public/sync.js","public/data.js","public/calc.js"]){
      mkdirSync(path.dirname(path.join(root,file)),{recursive:true});cpSync(file,path.join(root,file));
    }
    git("init","--quiet");git("config","user.name","Test");git("config","user.email","test@example.invalid");
    git("add",".");git("commit","--quiet","-m","initial");const audit=git("rev-parse","HEAD");
    writeFileSync(path.join(root,"diet-note.txt"),"Unrelated diet-only work\n");
    git("add",".");git("commit","--quiet","-m","diet");const diet=git("rev-parse","HEAD");
    const unchanged=compare(audit,diet);
    assert.equal(unchanged.status,0,unchanged.stderr);
    assert.equal(JSON.parse(unchanged.stdout).allInterveningInputsMatch,true);
    const html=fs.readFileSync(path.join(root,"public/index.html"),"utf8");
    writeFileSync(path.join(root,"public/index.html"),html.replace("window.AI_ENABLED=true","window.AI_ENABLED=false"));
    git("add",".");git("commit","--quiet","-m","AI change");
    writeFileSync(path.join(root,"public/index.html"),html);
    git("add",".");git("commit","--quiet","-m","revert AI");const reverted=git("rev-parse","HEAD");
    const changed=compare(audit,reverted);
    assert.equal(changed.status,0,changed.stderr);
    assert.equal(JSON.parse(changed.stdout).allInterveningInputsMatch,false);
    assert.notEqual(compare(reverted,audit).status,0);
    assert.equal(runGit(parent,["rev-parse","HEAD"]),parentHead);
    assert.deepEqual(fs.readFileSync(path.join(parent,".git/index")),parentIndex);
    assert.deepEqual(fs.readFileSync(path.join(parent,".git/config")),parentConfig);
    assert.equal(fs.readFileSync(path.join(parent,"sentinel.txt"),"utf8"),"Protected parent worktree\n");
  } finally {rmSync(scratch,{recursive:true,force:true});}
});
