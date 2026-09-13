#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { qualificationInputsHash } from "./release-lib.mjs";

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Qualification git comparison failed: ${result.stderr || result.error?.message}`);
  return result.stdout;
}
export function compareQualificationInputs(auditedCommit, releaseCommit) {
  if (![auditedCommit, releaseCommit].every((sha) => /^[a-f0-9]{40}$/.test(sha || "")))
    throw new Error("Qualification comparison requires two full commit SHAs");
  git(["merge-base", "--is-ancestor", auditedCommit, releaseCommit]);
  const fingerprint = (commit) => qualificationInputsHash((file) => git(["show", `${commit}:${file}`]));
  const inputsSha256 = fingerprint(auditedCommit);
  // Include every intervening commit, so a change followed by a revert also requires qualification.
  const commits = git(["rev-list", `${auditedCommit}..${releaseCommit}`]).trim().split("\n").filter(Boolean);
  return { auditedCommit, releaseCommit, ancestor: true, inputsSha256,
    allInterveningInputsMatch: commits.every((commit) => fingerprint(commit) === inputsSha256) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(compareQualificationInputs(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
