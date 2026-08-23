#!/usr/bin/env node
/* Owner-run production release path (Gate 0 redesign of the release flow).
   Deploys from an exact annotated tag with human Firebase OAuth, verifies the
   deployed Firestore Rules source against the tagged file, deploys both
   Hosting targets, byte-compares every public file on both hosts, and writes a
   token-free evidence manifest for the release-publish workflow.
   Usage: node scripts/release-deploy.mjs vX.Y.Z   (run from the checked-out tag)
*/

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PROJECT_ID = "diet-tracker-372ca";
const HOSTS = ["https://diet-tracker-372ca.web.app", "https://5asesny.web.app"];
const FIREBASE_RULES_RELEASE = `projects/${PROJECT_ID}/releases/firebase-firestore-rules`;

const die = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  die('usage: node scripts/release-deploy.mjs vX.Y.Z (from the checked-out annotated tag)');
}

console.log("— git provenance");
const status = sh("git", ["status", "--porcelain"]);
if (status.stdout.trim()) die("working tree is not clean; check out the exact tag first");
const tagType = sh("git", ["cat-file", "-t", tag]);
if (!/^\s*tag\s*$/.test(tagType.stdout)) die(`${tag} is not an annotated tag`);
sh("git", ["fetch", "--force", "origin", "main"]);
const peeled = sh("git", ["rev-parse", `${tag}^{commit}`]).stdout.trim();
const head = sh("git", ["rev-parse", "HEAD"]).stdout.trim();
const mainTip = sh("git", ["rev-parse", "origin/main"]).stdout.trim();
if (peeled !== head) die(`HEAD ${head} != ${tag} commit ${peeled}`);
if (peeled !== mainTip) die(`${tag} (${peeled}) is not origin/main (${mainTip})`);
console.log(`  ok: ${tag} -> ${peeled} = origin/main`);

console.log("— version agreement");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = tag.slice(1);
if (pkg.version !== version) die(`package.json ${pkg.version} != ${version}`);
const html = fs.readFileSync("public/index.html", "utf8");
if (!html.includes(`v${version}`)) die(`index.html has no visible v${version} runtime copy`);
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
if (!new RegExp(`^## \\[?${version}\\]?`, "m").test(changelog)) {
  die(`CHANGELOG.md has no ${version} section`);
}
console.log(`  ok: package/index/changelog agree on ${version}`);

console.log("— pinned tooling");
const pinned = (pkg.devDependencies || {})["firebase-tools"];
if (!pinned) die("package.json must pin firebase-tools");
const gotVersion = sh("npx", ["--no-install", "firebase", "--version"]).stdout.trim();
if (gotVersion !== pinned) die(`local firebase-tools ${gotVersion} != pinned ${pinned} (npm ci first)`);
const gcloudToken = sh("gcloud", ["auth", "print-access-token"]);
if (gcloudToken.status !== 0 || !gcloudToken.stdout.trim()) {
  die("gcloud access token unavailable: run `gcloud auth login` first (used in-memory only, never stored)");
}
const useOut = sh("npx", ["--no-install", "firebase", "use"]).stdout;
const active =
  (useOut.match(/Active Project:\s*(\S+)/) || useOut.match(/Now using project\s+(\S+)/) || [])[1];
if (active !== PROJECT_ID) die(`firebase use says "${active}", expected ${PROJECT_ID}`);
console.log(`  ok: firebase-tools ${pinned}, project ${PROJECT_ID}, gcloud token acquired`);

const fbConfig = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
const firestoreKeys = Object.keys((fbConfig.firestore || {}));
const rulesTargets = ["firestore:rules", ...(firestoreKeys.includes("indexes") ? ["firestore:indexes"] : [])];

function fetchRulesApi(pathname) {
  const res = spawnSync(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      `-H`,
      `Authorization: Bearer ${gcloudToken.stdout.trim()}`,
      `-H`,
      `Content-Type: application/json`,
      `https://firebaserules.googleapis.com/v1/${pathname}`,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) die(`Rules API call failed: ${res.stderr.trim()}`);
  return JSON.parse(res.stdout);
}

console.log("— deploy Firestore rules/indexes (before any client)");
const rulesDeploy = sh("npx", [
  "--no-install", "firebase", "deploy",
  "--project", PROJECT_ID,
  "--only", rulesTargets.join(","),
  "--non-interactive",
]);
if (rulesDeploy.status !== 0) die(`firestore deploy failed:\n${rulesDeploy.stderr || rulesDeploy.stdout}`);

console.log("— verify active Rules source against the tagged file");
const release = fetchRulesApi(FIREBASE_RULES_RELEASE);
const rulesetId = String(release.rulesetName || "").split("/").pop();
const ruleset = fetchRulesApi(`projects/${PROJECT_ID}/rulesets/${rulesetId}`);
const deployedSource = ruleset.source.files.map((f) => f.content).join("\n");
const localRules = fs.readFileSync(fbConfig.firestore.rules, "utf8");
if (deployedSource !== localRules) {
  die("deployed Ruleset source differs from the tagged rules file — refusing to deploy Hosting");
}
const rulesetHash = sha256(deployedSource);
let indexesHash = null;
if (firestoreKeys.includes("indexes")) {
  const idx = spawnSync(
    "curl",
    ["--fail", "--silent", "--show-error", "-H", `Authorization: Bearer ${gcloudToken.stdout.trim()}`,
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/indexes?pageSize=200`],
    { encoding: "utf8" },
  );
  if (idx.status !== 0) die(`index listing failed: ${idx.stderr.trim()}`);
  const normalized = JSON.stringify(JSON.parse(idx.stdout).indexes || [], null, 0);
  indexesHash = sha256(normalized);
}
console.log(`  ok: ruleset ${rulesetId} sha256 ${rulesetHash.slice(0, 12)}…`);

console.log("— deploy both Hosting targets");
const hostingDeploy = sh("npx", [
  "--no-install", "firebase", "deploy",
  "--project", PROJECT_ID,
  "--only", "hosting:main,hosting:nice",
  "--non-interactive",
]);
if (hostingDeploy.status !== 0) die(`hosting deploy failed:\n${hostingDeploy.stderr || hostingDeploy.stdout}`);

console.log("— byte-compare every public file on both hosts");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(path.relative("public", full));
  }
})("public");

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
let liveOk = true;
for (const host of HOSTS) {
  for (const file of files) {
    const urlPath = file === "index.html" ? "/" : `/${file}`;
    let body = null;
    for (let attempt = 1; attempt <= 5 && !body; attempt++) {
      try {
        body = await get(host + urlPath);
        if (!body.equals(fs.readFileSync(path.join("public", file)))) throw new Error("byte mismatch");
      } catch (e) {
        body = null;
        console.log(`  retry ${attempt}: ${host}${urlPath} (${e.message})`);
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
    if (!body) {
      liveOk = false;
      console.error(`  ✖ ${host}${urlPath} never matched`);
    }
  }
}
if (!liveOk) die("live byte verification failed on at least one file/host");

const bundleLines = files
  .slice()
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  .map((f) => `${sha256(fs.readFileSync(path.join("public", f)))}  ./${f}\n`)
  .join("");
const bundleHash = sha256(bundleLines);

fs.mkdirSync("docs/releases", { recursive: true });
const manifest = {
  tag,
  commitSha: peeled,
  projectId: PROJECT_ID,
  deployedAt: new Date().toISOString(),
  rulesetSha256: rulesetHash,
  indexesSha256: indexesHash,
  bundleSha256: bundleHash,
  hostsVerified: HOSTS,
  filesCompared: files.length,
  results: {
    rulesDeploy: "ok",
    rulesVerification: "ok",
    hostingDeploy: "ok",
    liveByteComparison: "ok",
  },
};
const manifestPath = `docs/releases/${tag}-evidence.json`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n✅ verified and recorded ${manifestPath}`);
console.log("\nNext: publish the GitHub Release (no Google credentials involved):\n");
console.log(`  gh workflow run release.yml \\`);
console.log(`    -f tag=${tag} \\`);
console.log(`    -f commit=${peeled} \\`);
console.log(`    -f bundle_sha256=${bundleHash} \\`);
console.log(`    -f ruleset_sha256=${rulesetHash} \\`);
console.log(`    -f deployed_at=${manifest.deployedAt}`);
