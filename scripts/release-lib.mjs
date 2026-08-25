import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROJECT_ID = "diet-tracker-372ca";
export const FIRESTORE_RULES_RELEASE = `projects/${PROJECT_ID}/releases/cloud.firestore`;
export const VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const AI_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PRODUCTION_HOSTS = [
  "https://diet-tracker-372ca.web.app",
  "https://5asesny.web.app",
];
export const AI_LOG_EXCLUSION = 'resource.type="firebasevertexai.googleapis.com/Model"';
export const AI_P4SA = "service-142673055934@gcp-sa-firebasevertexai.iam.gserviceaccount.com";
export const AI_ROLLOUT_STAGES = {
  disabled: "ai-disabled-rollout",
  enabled: "ai-enabled-rollout",
};
export const AI_CONFIGURATION_STATES = {
  disabledPreconfiguration: "disabled-preconfiguration",
  disabledHardened401: "disabled-hardened-invalid-app-check-401",
  enabled: "enabled",
};
export const AI_GENERATE_CONTENT_QUOTA_METRIC =
  "firebasevertexai.googleapis.com/generate_content_requests_per_minute_per_project_per_user";
export const AI_GENERATE_CONTENT_QUOTA_ID =
  "GenerateContentRequestsPerMinutePerProjectPerUser";
export const AI_QUOTA_NAMED_REGIONS = Object.freeze([
  "africa-south1",
  "asia-east1",
  "asia-east2",
  "asia-northeast1",
  "asia-northeast2",
  "asia-northeast3",
  "asia-south1",
  "asia-southeast1",
  "asia-southeast2",
  "australia-southeast1",
  "australia-southeast2",
  "europe-central2",
  "europe-north1",
  "europe-southwest1",
  "europe-west1",
  "europe-west12",
  "europe-west2",
  "europe-west3",
  "europe-west4",
  "europe-west6",
  "europe-west8",
  "europe-west9",
  "me-central1",
  "me-central2",
  "me-west1",
  "northamerica-northeast1",
  "northamerica-northeast2",
  "southamerica-east1",
  "southamerica-west1",
  "us-central1",
  "us-east1",
  "us-east4",
  "us-east5",
  "us-south1",
  "us-west1",
  "us-west2",
  "us-west3",
  "us-west4",
]);
export const AI_QUOTA_GROUPED_APPLICABLE_LOCATIONS = Object.freeze([
  "asia-south2",
  "asia-southeast3",
  "europe-north2",
  "europe-west10",
  "northamerica-south1",
]);
export const AI_QUOTA_DIMENSIONS_INFO_COUNT = AI_QUOTA_NAMED_REGIONS.length + 1;
export const AI_REQUIRED_SPOT_CHECKS = [
  "authenticated-success",
  "unauthenticated-401",
  "invalid-app-check-403",
  "localhost-debug-token",
  "both-production-hosts",
  "calorie-reference",
  "latency-comparison",
];

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
  const runtimeResources = fs.readFileSync(path.join(root, "runtime-resources.json"));
  const hostingHeaders = config.hosting.map((site) => ({ target: site.target, headers: site.headers }));
  return {
    rulesetSha256: sha256(rules),
    indexesSha256: sha256(canonicalIndexSpec(indexes)),
    bundleSha256: bundleDetails(path.join(root, "public")).hash,
    runtimeResourcesSha256: sha256(runtimeResources),
    hostingHeadersSha256: sha256(JSON.stringify(hostingHeaders)),
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

export function clientAiEnabledFromIndexHtml(indexHtml) {
  if (typeof indexHtml !== "string") return null;
  const matches = [...indexHtml.matchAll(/\bwindow\.AI_ENABLED\s*=\s*(true|false)\s*;/g)];
  return matches.length === 1 ? matches[0][1] === "true" : null;
}

function quotaInventoryAt(quota, limit) {
  if (quota?.metric !== AI_GENERATE_CONTENT_QUOTA_METRIC ||
      quota?.quotaId !== AI_GENERATE_CONTENT_QUOTA_ID ||
      !Array.isArray(quota?.dimensionsInfos) ||
      quota.dimensionsInfos.length !== AI_QUOTA_DIMENSIONS_INFO_COUNT) return false;
  const exactKeys = (value) => value && typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "applicableLocations,limit,region";
  const named = quota.dimensionsInfos.filter((info) =>
    exactKeys(info) && typeof info.region === "string" && info.region.length > 0 &&
      Array.isArray(info.applicableLocations) && info.applicableLocations.length === 0 &&
      info.limit === limit,
  );
  const grouped = quota.dimensionsInfos.filter((info) =>
    exactKeys(info) && info.region === null && info.limit === limit &&
      Array.isArray(info.applicableLocations) && info.applicableLocations.length > 0 &&
      info.applicableLocations.every((location) =>
        typeof location === "string" && location.length > 0,
      ) && new Set(info.applicableLocations).size === info.applicableLocations.length,
  );
  const namedRegions = named.map((info) => info.region).sort();
  const groupedLocations = grouped[0]?.applicableLocations.slice().sort();
  return named.length === AI_QUOTA_NAMED_REGIONS.length && grouped.length === 1 &&
    JSON.stringify(namedRegions) === JSON.stringify([...AI_QUOTA_NAMED_REGIONS].sort()) &&
    JSON.stringify(groupedLocations) ===
      JSON.stringify([...AI_QUOTA_GROUPED_APPLICABLE_LOCATIONS].sort());
}

function exactEnablementTargets(model) {
  return {
    model,
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
  };
}

function sameObject(actual, expected) {
  return JSON.stringify(sortedObject(actual)) === JSON.stringify(sortedObject(expected));
}

function canonicalIsoTimestamp(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function releaseVerificationProblems(
  record,
  { tag, commitSha, model, indexHtml, now = Date.now() },
) {
  const problems = [];
  const add = (ok, message) => {
    if (!ok) problems.push(message);
  };
  add(!!record && typeof record === "object" && !Array.isArray(record),
    "release verification must be a JSON object");
  if (problems.length) return problems;
  add(record.schemaVersion === 5, "release verification schemaVersion must be 5");
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
  add(JSON.stringify(record.productionHosts) === JSON.stringify(PRODUCTION_HOSTS),
    "release verification must name both exact production hosts");
  const clientAiEnabled = clientAiEnabledFromIndexHtml(indexHtml);
  add(clientAiEnabled !== null,
    "release verification must derive one literal window.AI_ENABLED value from the exact tagged index.html bytes");
  const expectedStage = clientAiEnabled === true ? AI_ROLLOUT_STAGES.enabled :
    clientAiEnabled === false ? AI_ROLLOUT_STAGES.disabled : null;
  add(clientAiEnabled !== null && record.stage === expectedStage,
    `release verification stage must match the tagged client (${expectedStage || "unresolved"})`);
  add(record.appCheck?.firestoreEnforced === true,
    "release verification must confirm Firestore App Check enforcement");
  add(record.model === model, `release verification model must be ${model}`);
  add(record.modelAvailableWithoutBilling === true,
    "release verification must confirm the model remains available without billing");
  add(sameObject(record.aiEnablementTargets, exactEnablementTargets(model)),
    "release verification must record the exact planned AI enablement targets");
  const freeTier = record.aiLogic?.freeTierBackendQuotas;
  add(freeTier?.rpmPerProjectModel === 15 && freeTier?.rpdPerProjectModel === 500 &&
    freeTier?.inputTpmPerProjectModel === 250000 &&
    freeTier?.inputTpdPerProjectModel === "unlimited-or-unspecified",
  "release verification must record the reviewed Gemini 3.5 Flash-Lite free-tier quota rows");
  add(record.aiLogic?.p4saEmail === AI_P4SA &&
    record.aiLogic?.p4saRole === "roles/firebaseml.serviceAgent",
  "release verification must confirm the Firebase AI Logic P4SA and service-agent role");
  add(record.aiLogic?.usesP4saForAuthorization === true,
    "release verification must confirm Firebase AI Logic uses P4SA authorization");
  add(record.aiLogic?.serverSideGeminiKeyObfuscated === true,
    "release verification must confirm any service-managed Gemini key remains server-side and obfuscated");
  add(record.aiLogic?.geminiDeveloperApiKeyEmbedded === false,
    "release verification must confirm no Gemini Developer API key is embedded");
  add(record.aiLogic?.publicBrowserKeyAllowsGenerativeLanguage === false,
    "release verification must confirm the public browser key does not allow Generative Language API");
  add(record.aiLogic?.obsoleteGeminiKeyHasRecentConsumers === false,
    "release verification must confirm any obsolete Gemini key has no recent consumers");
  add(record.aiLogic?.telemetryMode === "NONE" &&
    record.aiLogic?.telemetrySamplingRate === 1,
  "release verification must record Firebase AI Logic telemetry mode NONE with sampling rate 1");
  const spot = record.aiLogic?.spotChecks;
  const spotAt = Date.parse(spot?.completedAt);
  add(record.logging?.defaultBucketRetentionDays === 30,
    "release verification must record the _Default log bucket retention");
  add(record.logging?.aggregateMetricsRemainAvailable === true,
    "release verification must confirm aggregate AI metrics remain available");
  add(record.logging?.exportsConfigured === false,
    "release verification must confirm no log export sink is configured");
  const validateHardenedSpotChecks = (label) => {
    add(spot?.calorieReferencePassed === true && spot?.latencyCompared === true &&
      spot?.localhostDebugTokenPassed === true &&
      JSON.stringify(spot?.productionHostsPassed) === JSON.stringify(PRODUCTION_HOSTS) &&
      Number.isFinite(spotAt) && spotAt <= now + 5 * 60 * 1000 && now - spotAt <= VERIFICATION_MAX_AGE_MS,
    `${label} must include current localhost, both-host, calorie-reference, and latency spot-check evidence`);
  };
  const validateHardenedLogging = (label) => {
    add(record.logging?.exclusionDisabled === false &&
      record.logging?.exclusionFilter === AI_LOG_EXCLUSION,
    `${label} must confirm the enabled exact AI Model log-body exclusion resource`);
    const createdValue = record.logging?.exclusionCreatedAt;
    const updatedValue = record.logging?.exclusionUpdatedAt;
    const exclusionVerifiedValue = record.logging?.exclusionVerifiedAt;
    const expiryValue = record.logging?.existingModelLogsExpireAt;
    const createdCanonical = canonicalIsoTimestamp(createdValue);
    const updatedCanonical = canonicalIsoTimestamp(updatedValue);
    const exclusionVerifiedCanonical = canonicalIsoTimestamp(exclusionVerifiedValue);
    const expiryCanonical = canonicalIsoTimestamp(expiryValue);
    const createdAt = createdCanonical ? Date.parse(createdValue) : Number.NaN;
    const updatedAt = updatedCanonical ? Date.parse(updatedValue) : Number.NaN;
    const exclusionVerifiedAt = exclusionVerifiedCanonical ?
      Date.parse(exclusionVerifiedValue) : Number.NaN;
    const expiryAt = expiryCanonical ? Date.parse(expiryValue) : Number.NaN;
    add(createdCanonical,
      `${label} must record canonical ISO exclusionCreatedAt evidence`);
    add(updatedCanonical,
      `${label} must record canonical ISO exclusionUpdatedAt evidence`);
    add(exclusionVerifiedCanonical,
      `${label} must record canonical ISO exclusionVerifiedAt evidence`);
    if (createdCanonical && updatedCanonical) {
      add(createdAt <= updatedAt,
        "AI log exclusion createTime cannot be after updateTime");
    }
    if (updatedCanonical && exclusionVerifiedCanonical) {
      add(updatedAt <= exclusionVerifiedAt,
        "AI log exclusion updateTime cannot be after exclusionVerifiedAt");
    }
    if (exclusionVerifiedCanonical && Number.isFinite(verifiedAt)) {
      add(exclusionVerifiedAt <= verifiedAt,
        "AI log exclusionVerifiedAt cannot be after release verifiedAt");
      add(verifiedAt - exclusionVerifiedAt >= 0 &&
        verifiedAt - exclusionVerifiedAt <= VERIFICATION_MAX_AGE_MS,
      "AI log exclusionVerifiedAt must be within 24 hours of release verifiedAt");
    }
    if (createdCanonical) {
      add(createdAt <= now,
        "AI log exclusion createTime cannot be in the future");
    }
    if (updatedCanonical) {
      add(updatedAt <= now,
        "AI log exclusion updateTime cannot be in the future");
    }
    if (exclusionVerifiedCanonical) {
      add(exclusionVerifiedAt <= now,
        "AI log exclusionVerifiedAt cannot be in the future");
      add(now - exclusionVerifiedAt <= VERIFICATION_MAX_AGE_MS,
        "AI log exclusion resource verification is older than 24 hours");
    }
    add(expiryCanonical,
      `${label} must record canonical ISO existingModelLogsExpireAt evidence`);
    if (updatedCanonical && expiryCanonical) {
      add(expiryAt === updatedAt + AI_LOG_RETENTION_MS,
        "existingModelLogsExpireAt must equal exclusionUpdatedAt plus the 30-day _Default retention");
    }
  };
  if (clientAiEnabled === false) {
    const disabledState = record.configurationState;
    add(disabledState === AI_CONFIGURATION_STATES.disabledPreconfiguration ||
      disabledState === AI_CONFIGURATION_STATES.disabledHardened401,
    "AI-disabled rollout must explicitly select a supported configurationState");
    if (disabledState === AI_CONFIGURATION_STATES.disabledPreconfiguration) {
      add(record.appCheck?.aiLogicEnforced === false &&
        record.appCheck?.bothHostsVerified === false,
      "Preconfiguration AI-disabled rollout must record the AI App Check baseline without live-host success claims");
      add(record.aiLogic?.authenticatedUsersRequired === false &&
        record.aiLogic?.authenticatedSuccessVerified === false &&
        record.aiLogic?.unauthenticated401Verified === false &&
        record.aiLogic?.invalidAppCheck403Verified === false &&
        record.aiLogic?.invalidAppCheckObservedHttpStatus === null,
      "Preconfiguration AI-disabled rollout must record the authenticated-users baseline without request success claims");
      add(quotaInventoryAt(record.aiLogic?.generateContentRpmPerUserQuota, 100),
        "Preconfiguration AI-disabled rollout must record the exact Generate Content metric/quotaId and all 39 location buckets at 100 RPM/user");
      add(spot?.calorieReferencePassed === false && spot?.latencyCompared === false &&
        spot?.localhostDebugTokenPassed === false &&
        Array.isArray(spot?.productionHostsPassed) && spot.productionHostsPassed.length === 0 &&
        spot?.completedAt === null,
      "Preconfiguration AI-disabled rollout must not claim post-deployment AI spot-check evidence");
      add(record.logging?.exclusionDisabled === null &&
        record.logging?.exclusionFilter === null &&
        record.logging?.exclusionCreatedAt === null &&
        record.logging?.exclusionUpdatedAt === null &&
        record.logging?.exclusionVerifiedAt === null &&
        record.logging?.existingModelLogsExpireAt === null,
      "Preconfiguration AI-disabled rollout must record the logging baseline without exclusion-resource or expiry claims");
    }
    if (disabledState === AI_CONFIGURATION_STATES.disabledHardened401) {
      add(record.appCheck?.aiLogicEnforced === true &&
        record.appCheck?.bothHostsVerified === true,
      "Hardened AI-disabled rollout must confirm Firebase AI Logic App Check enforcement on both production hosts");
      add(record.aiLogic?.authenticatedUsersRequired === true,
        "Hardened AI-disabled rollout must confirm Firebase AI Logic authenticated-users mode");
      add(record.aiLogic?.authenticatedSuccessVerified === true,
        "Hardened AI-disabled rollout must confirm an authenticated AI success");
      add(record.aiLogic?.unauthenticated401Verified === true,
        "Hardened AI-disabled rollout must confirm unauthenticated AI returns 401");
      add(record.aiLogic?.invalidAppCheck403Verified === false &&
        record.aiLogic?.invalidAppCheckObservedHttpStatus === 401,
      "Hardened AI-disabled rollout must record invalid App Check returning 401 without claiming 403 verification");
      add(quotaInventoryAt(record.aiLogic?.generateContentRpmPerUserQuota, 6),
        "Hardened AI-disabled rollout must record the exact Generate Content metric/quotaId and all 39 location buckets at exactly 6 RPM/user");
      validateHardenedSpotChecks("Hardened AI-disabled rollout");
      validateHardenedLogging("Hardened AI-disabled rollout");
    }
  }
  if (clientAiEnabled === true) {
    add(record.configurationState === AI_CONFIGURATION_STATES.enabled,
      "AI-enabled rollout configurationState must be enabled");
    add(record.appCheck?.aiLogicEnforced === true &&
      record.appCheck?.bothHostsVerified === true,
    "AI-enabled rollout must confirm Firebase AI Logic App Check enforcement on both production hosts");
    add(record.aiLogic?.authenticatedUsersRequired === true,
      "AI-enabled rollout must confirm Firebase AI Logic authenticated-users mode");
    add(record.aiLogic?.authenticatedSuccessVerified === true,
      "AI-enabled rollout must confirm an authenticated AI success");
    add(record.aiLogic?.unauthenticated401Verified === true,
      "AI-enabled rollout must confirm unauthenticated AI returns 401");
    add(record.aiLogic?.invalidAppCheck403Verified === true &&
      record.aiLogic?.invalidAppCheckObservedHttpStatus === 403,
    "AI-enabled rollout must record invalid App Check returning 403 and confirm 403 verification");
    add(quotaInventoryAt(record.aiLogic?.generateContentRpmPerUserQuota, 6),
      "AI-enabled rollout must record the exact Generate Content metric/quotaId and all 39 location buckets at exactly 6 RPM/user");
    validateHardenedSpotChecks("AI-enabled rollout");
    validateHardenedLogging("AI-enabled rollout");
  }
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
