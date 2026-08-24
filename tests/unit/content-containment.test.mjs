import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const html = read("public/index.html");
const data = read("public/data.js");
const render = read("public/render.js");
const stateAndSync = read("public/state.js") + read("public/sync.js");
const currentDocs = ["README.md", "AGENTS.md", "CHANGELOG.md"]
  .map(read)
  .join("\n");

test("current app ships without the retired plan and template surface", () => {
  const currentUi = html + render;
  assert.doesNotMatch(currentUi, /(?:tab|pg)-plan|renderPlan|PLAN_TEMPLATES/);
  assert.doesNotMatch(data, /PLAN_TEMPLATES/);
});

test("legacy product data is confined to its two saved meal options", () => {
  assert.equal((data.match(/Nitro-Tech/g) || []).length, 2);
  assert.doesNotMatch(html + render, /Nitro-Tech|InBody/);
});

test("current files contain no profile-specific migration or visible build credit", () => {
  assert.doesNotMatch(
    stateAndSync,
    /migrateReviewedProfile|REVIEWED_PROFILE_VERSION|reviewedProfileVersion/,
  );
  assert.doesNotMatch(html, /اتبني بواسطة/);
  assert.doesNotMatch(currentDocs, /Nitro-Tech|InBody/);
});

test("stale tracked screenshots are absent", () => {
  [
    "docs/screenshots/authenticated-ai-calorie-reference-desktop.png",
    "docs/screenshots/authenticated-ai-calorie-reference-mobile.png",
    "docs/screenshots/desktop.png",
    "docs/screenshots/mobile.png",
  ].forEach((path) => assert.equal(fs.existsSync(path), false, path));
  [
    "docs/screenshots/content-cleanup-before-desktop.png",
    "docs/screenshots/content-cleanup-before-mobile.png",
    "docs/screenshots/content-cleanup-after-desktop.png",
    "docs/screenshots/content-cleanup-after-mobile.png",
  ].forEach((path) => assert.equal(fs.existsSync(path), true, path));
  assert.doesNotMatch(read("README.md"), /docs\/screenshots|## Screenshots/);
});
