#!/usr/bin/env node
/* Owner-run production release path. Validates the tagged revision and current
   Firebase settings before deploying and verifying Rules, indexes, and Hosting. */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import {
  FIRESTORE_RULES_RELEASE,
  PROJECT_ID,
  PRODUCTION_HOSTS,
  activeFirebaseProject,
  bundleDetails,
  canonicalIndexSpec,
  clientAiEnabledFromIndexHtml,
  matchingValidationRuns,
  releaseVerificationProblems,
  sha256,
  taggedConfigHashes,
} from "./release-lib.mjs";
import { AI_MODEL_ALLOWLIST } from "./spark-guard.mjs";

const HOSTS = PRODUCTION_HOSTS;
const MODEL = AI_MODEL_ALLOWLIST[0];

const die = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

function command(label, executable, args) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || result.stdout?.trim();
    die(`${label} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    die(`${label} returned invalid JSON: ${error.message}`);
  }
}

async function getJson(url, accessToken, label) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Goog-User-Project": PROJECT_ID,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    die(`${label} failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }
  return response.json();
}

async function listCompositeIndexes(accessToken) {
  const indexes = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/-/indexes`,
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await getJson(url, accessToken, "Firestore index readiness check");
    indexes.push(...(page.indexes || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return indexes;
}

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  die('usage: node scripts/release-deploy.mjs vX.Y.Z (from the checked-out annotated tag)');
}

console.log("— git provenance");
const status = command("git status", "git", ["status", "--porcelain"]);
if (status.trim()) die("working tree is not clean; check out the exact tag first");
const tagType = command("annotated-tag check", "git", ["cat-file", "-t", tag]);
if (tagType.trim() !== "tag") die(`${tag} is not an annotated tag`);
command("origin/main fetch", "git", ["fetch", "--force", "origin", "main"]);
command("release-tag fetch", "git", [
  "fetch",
  "--force",
  "origin",
  `refs/tags/${tag}:refs/tags/${tag}`,
]);
const peeled = command("tag peel", "git", ["rev-parse", `${tag}^{commit}`]).trim();
const head = command("HEAD lookup", "git", ["rev-parse", "HEAD"]).trim();
const mainTip = command("origin/main lookup", "git", ["rev-parse", "origin/main"]).trim();
if (peeled !== head) die(`HEAD ${head} != ${tag} commit ${peeled}`);
if (peeled !== mainTip) die(`${tag} (${peeled}) is not origin/main (${mainTip})`);
console.log(`  ok: ${tag} -> ${peeled} = origin/main`);

console.log("— version agreement");
const pkg = parseJson(fs.readFileSync("package.json", "utf8"), "package.json");
const version = tag.slice(1);
if (pkg.version !== version) die(`package.json ${pkg.version} != ${version}`);
const html = fs.readFileSync("public/index.html", "utf8");
const visibleVersion = (html.match(/<footer>[\s\S]*?<b>v([^<]+)<\/b>/) || [])[1];
if (visibleVersion !== version) {
  die(`index.html visible version ${visibleVersion || "<missing>"} != ${version}`);
}
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
if (!new RegExp(`^## \\[?${version.replaceAll(".", "\\.")}\\]?`, "m").test(changelog)) {
  die(`CHANGELOG.md has no ${version} section`);
}
console.log(`  ok: package/index/changelog agree on ${version}`);

console.log("— successful tag validation");
const validationOutput = command("GitHub validation lookup", "gh", [
  "run",
  "list",
  "--workflow",
  "release.yml",
  "--branch",
  tag,
  "--commit",
  peeled,
  "--event",
  "push",
  "--status",
  "success",
  "--limit",
  "20",
  "--json",
  "databaseId,workflowName,headBranch,headSha,event,status,conclusion,url",
]);
const validationRun = matchingValidationRuns(
  parseJson(validationOutput, "GitHub validation lookup"),
  tag,
  peeled,
)[0];
if (!validationRun) {
  die(`no successful release validation run exists for ${tag} at ${peeled}`);
}
console.log(`  ok: validation run ${validationRun.databaseId} ${validationRun.url}`);

console.log("— current Firebase release checks");
const verificationPath =
  process.env.DIET_RELEASE_VERIFICATION || `local/release-verification-${tag}.json`;
if (!fs.existsSync(verificationPath)) {
  die(`missing ${verificationPath}; follow docs/releasing.md before deploying`);
}
const verificationRaw = fs.readFileSync(verificationPath, "utf8");
const verification = parseJson(verificationRaw, verificationPath);
const verificationProblems = releaseVerificationProblems(verification, {
  tag,
  commitSha: peeled,
  model: MODEL,
  indexHtml: html,
});
if (verificationProblems.length) {
  die(
    `release verification failed:\n` +
      verificationProblems.map((item) => `  - ${item}`).join("\n"),
  );
}
const clientAiEnabled = clientAiEnabledFromIndexHtml(html);
console.log(
  `  ok: Spark/no billing verified; highest observed quota usage ` +
    `${verification.maxObservedQuotaPercent}%; ` +
    (clientAiEnabled ? "hardened AI enablement evidence verified" :
      "AI-disabled baseline and enablement targets verified"),
);

console.log("— pinned tooling and credentials");
const pinned = (pkg.devDependencies || {})["firebase-tools"];
if (!/^\d+\.\d+\.\d+$/.test(pinned || "")) {
  die("package.json must pin firebase-tools to an exact version");
}
const gotVersion = command("firebase-tools version check", "npx", [
  "--no-install",
  "firebase",
  "--version",
]).trim();
if (gotVersion !== pinned) die(`local firebase-tools ${gotVersion} != pinned ${pinned} (npm ci first)`);
const useOut = command("active Firebase project check", "npx", [
  "--no-install",
  "firebase",
  "use",
]);
const active = activeFirebaseProject(useOut);
if (active !== PROJECT_ID) die(`firebase use says "${active}", expected ${PROJECT_ID}`);
const gcloudToken = command("gcloud access-token check", "gcloud", [
  "auth",
  "print-access-token",
]).trim();
if (!gcloudToken) die("gcloud returned an empty access token; run `gcloud auth login` first");
console.log(`  ok: firebase-tools ${pinned}, project ${PROJECT_ID}, human credentials available`);

const fbConfig = parseJson(fs.readFileSync("firebase.json", "utf8"), "firebase.json");
const taggedHashes = taggedConfigHashes();
const localRules = fs.readFileSync(fbConfig.firestore.rules, "utf8");
const localIndexSpec = parseJson(
  fs.readFileSync(fbConfig.firestore.indexes, "utf8"),
  fbConfig.firestore.indexes,
);

console.log("— deploy Firestore rules/indexes (before any client)");
command("Firestore Rules/index deploy", "npx", [
  "--no-install",
  "firebase",
  "deploy",
  "--project",
  PROJECT_ID,
  "--only",
  "firestore:rules,firestore:indexes",
  "--non-interactive",
]);

console.log("— verify active Rules and indexes against tagged files");
const release = await getJson(
  `https://firebaserules.googleapis.com/v1/${FIRESTORE_RULES_RELEASE}`,
  gcloudToken,
  "active Firestore Rules release lookup",
);
const rulesetId = String(release.rulesetName || "").split("/").pop();
if (!rulesetId) die("active Firestore Rules release has no rulesetName");
const ruleset = await getJson(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets/${rulesetId}`,
  gcloudToken,
  "active Firestore Ruleset lookup",
);
const deployedFiles = ruleset.source?.files || [];
if (deployedFiles.length !== 1 || deployedFiles[0].content !== localRules) {
  die("deployed Ruleset source differs from the tagged rules file — refusing to deploy Hosting");
}
if (sha256(localRules) !== taggedHashes.rulesetSha256) {
  die("tagged Rules hash changed during deployment");
}

const deployedIndexText = command("deployed Firestore index listing", "npx", [
  "--no-install",
  "firebase",
  "firestore:indexes",
  "--project",
  PROJECT_ID,
  "--database",
  "(default)",
]);
const deployedIndexSpec = parseJson(deployedIndexText, "firebase firestore:indexes");
if (canonicalIndexSpec(deployedIndexSpec) !== canonicalIndexSpec(localIndexSpec)) {
  die("deployed indexes/field overrides differ from the tagged indexes file");
}
const compositeIndexes = await listCompositeIndexes(gcloudToken);
const unready = compositeIndexes.filter((index) => index.state !== "READY");
if (unready.length) {
  die(`Firestore has ${unready.length} composite index(es) that are not READY`);
}
console.log(
  `  ok: ruleset ${rulesetId}; Rules ${taggedHashes.rulesetSha256.slice(0, 12)}…; ` +
    `indexes ${taggedHashes.indexesSha256.slice(0, 12)}…`,
);

console.log("— deploy both Hosting targets");
command("Hosting deploy", "npx", [
  "--no-install",
  "firebase",
  "deploy",
  "--project",
  PROJECT_ID,
  "--only",
  "hosting:main,hosting:nice",
  "--non-interactive",
]);

console.log("— byte-compare every public file on both hosts");
const bundle = bundleDetails();
async function getLive(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
let liveOk = true;
for (const host of HOSTS) {
  for (const file of bundle.files) {
    const urlPath =
      file === "index.html"
        ? "/"
        : `/${file.split(path.sep).map(encodeURIComponent).join("/")}`;
    let matched = false;
    for (let attempt = 1; attempt <= 5 && !matched; attempt++) {
      try {
        const body = await getLive(host + urlPath);
        if (!body.equals(fs.readFileSync(path.join("public", file)))) {
          throw new Error("byte mismatch");
        }
        matched = true;
      } catch (error) {
        console.log(`  retry ${attempt}: ${host}${urlPath} (${error.message})`);
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }
    if (!matched) {
      liveOk = false;
      console.error(`  ✖ ${host}${urlPath} never matched`);
    }
  }
}
if (!liveOk) die("live byte verification failed on at least one file/host");
if (bundle.hash !== taggedHashes.bundleSha256) die("tagged bundle hash changed during deployment");
const deployedAt = new Date().toISOString();

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  die("post-deploy Spark/config verification requires an interactive terminal");
}
console.log("— repeat the manual Spark/config check after deployment");
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
const confirmation = await prompt.question(
  'Confirm the console still shows Spark, no linked billing, and no forbidden config; then type "SPARK-VERIFIED": ',
);
prompt.close();
if (confirmation !== "SPARK-VERIFIED") {
  die("post-deploy Spark/config verification was not confirmed; do not publish this release");
}
const postDeployVerifiedAt = new Date().toISOString();

fs.mkdirSync("local/releases", { recursive: true });
const manifest = {
  schemaVersion: 1,
  tag,
  commitSha: peeled,
  projectId: PROJECT_ID,
  validationRunId: validationRun.databaseId,
  validationRunUrl: validationRun.url,
  settingsVerifiedAt: verification.verifiedAt,
  verificationSha256: sha256(verificationRaw),
  deployedAt,
  postDeployVerifiedAt,
  rulesetId,
  rulesetSha256: taggedHashes.rulesetSha256,
  indexesSha256: taggedHashes.indexesSha256,
  bundleSha256: taggedHashes.bundleSha256,
  hostsVerified: HOSTS,
  filesCompared: bundle.files.length,
  smokeResults: {
    authenticatedRulesApiRead: "ok",
    authenticatedIndexListing: "ok",
    compositeIndexesReady: "ok",
    liveByteComparison: "ok",
  },
  results: {
    rulesAndIndexesDeploy: "ok",
    rulesVerification: "ok",
    indexVerification: "ok",
    hostingDeploy: "ok",
    postDeploySparkVerification: "ok",
  },
};
const manifestPath = `local/releases/${tag}-manifest.json`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n✅ verified and recorded ${manifestPath}`);
console.log("\nNext: publish the GitHub Release (no Google credentials involved):\n");
console.log(
  `  gh workflow run release.yml -f tag=${tag} -f commit=${peeled} ` +
    `-f validation_run_id=${validationRun.databaseId} ` +
    `-f bundle_sha256=${taggedHashes.bundleSha256} ` +
    `-f ruleset_sha256=${taggedHashes.rulesetSha256} ` +
    `-f indexes_sha256=${taggedHashes.indexesSha256} ` +
    `-f verification_sha256=${manifest.verificationSha256} ` +
    `-f deployed_at=${manifest.deployedAt} ` +
    `-f post_deploy_verified_at=${postDeployVerifiedAt}`,
);
