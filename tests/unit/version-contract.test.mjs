import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { versionContractProblems } from "../../scripts/version-contract.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "diet-version-contract-"));
  fs.mkdirSync(path.join(root, "public"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "3.9.0" }));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ version: "3.9.0", packages: { "": { version: "3.9.0" } } }));
  fs.writeFileSync(path.join(root, "public/data.js"), 'const APP_VERSION="3.9.0";');
  fs.writeFileSync(path.join(root, "public/index.html"), '<footer><b id="app-version"></b></footer>');
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), "## [3.9.0] - 2026-08-25\n");
  return root;
}

test("canonical package version agrees with lock, runtime, tag, footer contract, and changelog", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(versionContractProblems({ root, tag: "v3.9.0" }), []);
});

test("each deliberate version mismatch is rejected", (t) => {
  const cases = [
    ["lock", (root) => fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ version: "3.8.1", packages: { "": { version: "3.9.0" } } }))],
    ["runtime", (root) => fs.writeFileSync(path.join(root, "public/data.js"), 'const APP_VERSION="3.8.1";')],
    ["footer", (root) => fs.writeFileSync(path.join(root, "public/index.html"), '<footer><b>v3.9.0</b></footer>')],
    ["changelog", (root) => fs.writeFileSync(path.join(root, "CHANGELOG.md"), "## [3.8.1] - 2026-08-25\n")],
  ];
  for (const [label, mutate] of cases) {
    const root = fixture();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    mutate(root);
    assert.ok(versionContractProblems({ root, tag: "v3.9.0" }).length, label);
  }
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.ok(versionContractProblems({ root, tag: "v3.8.1" }).some((problem) => problem.includes("release tag")));
});
