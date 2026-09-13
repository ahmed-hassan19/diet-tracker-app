#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { matchingQualityRuns } from "./release-lib.mjs";
const commit = process.argv[2];
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[a-f0-9]{40}$/.test(commit || "") || !/^[\w.-]+\/[\w.-]+$/.test(repository || ""))
  throw new Error("Quality evidence requires a full commit SHA and GITHUB_REPOSITORY");
function api(endpoint) {
  const result = spawnSync("gh", ["api", endpoint], {encoding: "utf8"});
  if (result.error || result.status !== 0) throw new Error("Cannot retrieve quality evidence from the repository Actions API");
  return JSON.parse(result.stdout);
}
const workflow = api(`repos/${repository}/actions/workflows/quality.yml`);
if (workflow.path !== ".github/workflows/quality.yml" || !Number.isSafeInteger(workflow.id))
  throw new Error("Unexpected quality workflow identity");
const response = api(`repos/${repository}/actions/workflows/${workflow.id}/runs?branch=main&event=push&head_sha=${commit}&status=success&per_page=100`);
const run = matchingQualityRuns(response.workflow_runs, commit, repository, workflow.id)[0];
if (!run) throw new Error(`No successful quality push on main for exact commit ${commit}; wait for CI before tagging`);
console.log(JSON.stringify({repository, workflowId: workflow.id, runId: run.id, commit, url: run.html_url}));
