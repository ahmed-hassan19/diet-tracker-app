#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_RE = /^\d+\.\d+\.\d+$/;

export function versionContractProblems({ root = ".", tag = null } = {}) {
  const problems = [];
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  let pkg;
  let lock;
  try { pkg = JSON.parse(read("package.json")); }
  catch (error) { return [`package.json is invalid: ${error.message}`]; }
  try { lock = JSON.parse(read("package-lock.json")); }
  catch (error) { return [`package-lock.json is invalid: ${error.message}`]; }
  const version = pkg.version;
  if (!VERSION_RE.test(version || "")) problems.push("package.json version must be Semantic Versioning X.Y.Z");
  if (lock.version !== version) problems.push(`package-lock.json version ${lock.version || "<missing>"} != package.json ${version}`);
  if (lock.packages?.[""]?.version !== version) problems.push(`package-lock.json root package version ${lock.packages?.[""]?.version || "<missing>"} != package.json ${version}`);

  const data = read("public/data.js");
  const runtimeMatches = [...data.matchAll(/\bconst APP_VERSION="([^"]+)";/g)];
  if (runtimeMatches.length !== 1) problems.push(`public/data.js must contain exactly one const APP_VERSION runtime copy (found ${runtimeMatches.length})`);
  else if (runtimeMatches[0][1] !== version) problems.push(`public/data.js APP_VERSION ${runtimeMatches[0][1]} != package.json ${version}`);

  const html = read("public/index.html");
  if (!/<b id="app-version"><\/b>/.test(html)) problems.push("public/index.html footer must render the checked APP_VERSION through #app-version");
  if (new RegExp(`<b[^>]*>v${String(version).replaceAll(".", "\\.")}<\\/b>`).test(html)) problems.push("public/index.html must not hard-code the visible version");

  const changelog = read("CHANGELOG.md");
  if (!new RegExp(`^## \\[${String(version).replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m").test(changelog)) {
    problems.push(`CHANGELOG.md has no dated [${version}] release section`);
  }
  if (tag !== null) {
    if (!/^v\d+\.\d+\.\d+$/.test(tag)) problems.push(`release tag ${tag || "<missing>"} must be vX.Y.Z`);
    else if (tag.slice(1) !== version) problems.push(`release tag ${tag} != package.json v${version}`);
  }
  return problems;
}

export function assertVersionContract(options) {
  const problems = versionContractProblems(options);
  if (problems.length) throw new Error(`Version contract failed:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tagIndex = process.argv.indexOf("--tag");
  const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : null;
  try {
    assertVersionContract({ tag });
    const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
    console.log(`Version contract verified for ${tag || `v${version}`}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
