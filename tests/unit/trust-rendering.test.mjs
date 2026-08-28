import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { expectedCsp, securityHeaderProblems, staticHandlerSources } from "../../scripts/csp.mjs";
import { taggedConfigHashes } from "../../scripts/release-lib.mjs";
import { runtimeResourceProblems } from "../../scripts/runtime-resources.mjs";

const html = fs.readFileSync("public/index.html", "utf8");
const config = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("runtime-resources.json", "utf8"));
const classic = ["state.js", "render.js", "sync.js"].map((name) => fs.readFileSync(`public/${name}`, "utf8")).join("\n");

test("dynamic UI has no HTML sinks, SVG strings, escaping-as-safety, or generated inline handlers", () => {
  assert.doesNotMatch(classic, /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML\b|document\.write\b|<svg\b/i);
  assert.doesNotMatch(fs.readFileSync("public/render.js", "utf8"), /\besc\s*\(|\bmacros\s*\(|\bon(?:click|change|input)\s*=/);
  assert.doesNotMatch(fs.readFileSync("public/render.js", "utf8"), /\bS(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=/);
  assert.match(classic, /createElementNS/);
  assert.match(classic, /textContent/);
  assert.match(classic, /replaceChildren/);
});

test("CSP is derived from the one inline module and every remaining static handler", () => {
  assert.deepEqual(securityHeaderProblems(), []);
  const csp = expectedCsp(html, manifest.resources.map((resource) => resource.url));
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src-attr 'unsafe-hashes'/);
  assert.doesNotMatch(csp, /script-src(?:-elem)?[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /unsafe-eval|https:\/\/www\.gstatic\.com(?:\s|;)/);
  assert.doesNotMatch(csp, /https:\/\/www\.googleapis\.com(?:\s|;)/);
  assert.match(csp, /https:\/\/www\.googleapis\.com\/identitytoolkit\//);
  assert.match(csp, /connect-src[^;]*https:\/\/www\.google\.com\/recaptcha\//);
  const permissions = config.hosting[0].headers.find((entry) => entry.source === "**")
    .headers.find((header) => header.key === "Permissions-Policy").value;
  assert.match(permissions, /storage-access=\(self "https:\/\/www\.google\.com" "https:\/\/recaptcha\.google\.com"\)/);
  assert.doesNotMatch(permissions, /storage-access=\(\)/);
  assert.equal(staticHandlerSources(html).length, 25);
  const mutated = structuredClone(config);
  mutated.hosting[0].headers.find((entry) => entry.source === "**").headers[0].value += " 'unsafe-eval'";
  assert.ok(securityHeaderProblems({ config: mutated, html, manifest }).length);
});

test("runtime-resource manifest is exact and import, version, digest, or CSP drift fails static validation", () => {
  assert.deepEqual(runtimeResourceProblems(), []);
  for (const mutate of [
    (copy) => { copy.resources[0].bytes++; },
    (copy) => { copy.resources[0].sha256 = "0".repeat(64); },
    (copy) => { copy.resources[0].url = copy.resources[0].url.replace("12.17.1", "12.18.0"); },
    (copy) => { copy.resources.push({ ...copy.resources[0] }); },
  ]) {
    const changed = structuredClone(manifest); mutate(changed);
    assert.ok(runtimeResourceProblems({ manifest: changed, html, config }).length);
  }
  const changedHtml = html.replace("firebase-app.js", "firebase-app-unknown.js");
  assert.ok(runtimeResourceProblems({ manifest, html: changedHtml, config }).length);
});

test("release hashes bind runtime resources and the complete Hosting header configuration", () => {
  const hashes = taggedConfigHashes();
  for (const key of ["bundleSha256", "rulesetSha256", "indexesSha256", "runtimeResourcesSha256", "hostingHeadersSha256"]) assert.match(hashes[key], /^[a-f0-9]{64}$/);
  const deploy = fs.readFileSync("scripts/release-deploy.mjs", "utf8"),workflow = fs.readFileSync(".github/workflows/release.yml", "utf8");
  for (const marker of ["runtimeResourcesSha256", "hostingHeadersSha256", "verifyRuntimeResources", "verifyHostingHeaders"]) assert.match(deploy, new RegExp(marker));
  for (const marker of ["runtime_resources_sha256", "hosting_headers_sha256", "runtime-resources.mjs", "verify-hosting-headers.mjs"]) assert.match(workflow, new RegExp(marker));
});
