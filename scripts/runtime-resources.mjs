import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_RESOURCE_MANIFEST = "runtime-resources.json";
export const FIREBASE_RUNTIME_PREFIX = "https://www.gstatic.com/firebasejs/12.17.1/";
export const FIREBASE_RUNTIME_FILES = Object.freeze([
  "firebase-app.js",
  "firebase-app-check.js",
  "firebase-auth.js",
  "firebase-firestore.js",
  "firebase-ai.js",
]);
export const FIREBASE_RUNTIME_RESOURCES = Object.freeze([
  { url: FIREBASE_RUNTIME_PREFIX + "firebase-app.js", bytes: 104893, sha256: "79b4d0818cef01681e6a1b2cd6caddc907a714286ea18ef89d65d79d4170b2d5" },
  { url: FIREBASE_RUNTIME_PREFIX + "firebase-app-check.js", bytes: 25286, sha256: "99eb1914d92caf9f3cc5f784a17e669afe8ebccf7076542b30953c553b05250a" },
  { url: FIREBASE_RUNTIME_PREFIX + "firebase-auth.js", bytes: 156871, sha256: "b4020ce5e81d1247681d4973839f0861df900f86c82201e01a1a16d48796f8e9" },
  { url: FIREBASE_RUNTIME_PREFIX + "firebase-firestore.js", bytes: 683502, sha256: "090f40cff408d8ecce4803cb82a146ebaa9def839d29ed01bf73187389862e84" },
  { url: FIREBASE_RUNTIME_PREFIX + "firebase-ai.js", bytes: 62300, sha256: "2dc56a1248a9d0cc8d5706bf57f3fd50230a5461c49c3c7fa417e07d28cea5c9" },
]);

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const importedUrls = (html) => [...html.matchAll(/^import\s+[^;]+?\s+from\s+["']([^"']+)["'];$/gm)].map((match) => match[1]);
const cspValues = (config) => (config.hosting || []).map((site) => {
  const all = (site.headers || []).find((entry) => entry.source === "**");
  return (all?.headers || []).find((header) => header.key.toLowerCase() === "content-security-policy")?.value || "";
});
const dependencies = (source, baseUrl) => {
  const found = new Set();
  const patterns = [/(?:from\s*|import\s*)["']([^"']+)["']/g, /import\(\s*["']([^"']+)["']\s*\)/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(new URL(match[1], baseUrl).href);
  }
  return [...found];
};

export function runtimeResourceProblems({ root = ".", manifest = null, html = null, config = null } = {}) {
  const problems = [];
  const add = (condition, message) => { if (!condition) problems.push(message); };
  try { manifest ||= JSON.parse(fs.readFileSync(path.join(root, RUNTIME_RESOURCE_MANIFEST), "utf8")); }
  catch { return [`${RUNTIME_RESOURCE_MANIFEST} must be valid JSON`]; }
  try { html ||= fs.readFileSync(path.join(root, "public/index.html"), "utf8"); }
  catch { return ["public/index.html must be readable for runtime-resource validation"]; }
  try { config ||= JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8")); }
  catch { return ["firebase.json must be valid JSON for runtime-resource validation"]; }
  add(manifest?.version === 1, "runtime-resource manifest version must be 1");
  add(Array.isArray(manifest?.resources), "runtime-resource manifest must contain a resources array");
  const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
  const urls = resources.map((resource) => resource?.url);
  const expected = FIREBASE_RUNTIME_FILES.map((file) => FIREBASE_RUNTIME_PREFIX + file);
  add(JSON.stringify(resources) === JSON.stringify(FIREBASE_RUNTIME_RESOURCES), "runtime-resource manifest must match the reviewed lengths and SHA-256 values exactly");
  add(JSON.stringify(urls) === JSON.stringify(expected), "runtime-resource URLs must be the five ordered Firebase 12.17.1 imports");
  add(new Set(urls).size === urls.length, "runtime-resource URLs must be unique");
  resources.forEach((resource, index) => {
    add(resource && Object.keys(resource).sort().join(",") === "bytes,sha256,url", `runtime resource ${index} must contain only url, bytes, and sha256`);
    add(Number.isInteger(resource?.bytes) && resource.bytes > 0, `runtime resource ${index} must pin a positive byte length`);
    add(typeof resource?.sha256 === "string" && /^[a-f0-9]{64}$/.test(resource.sha256), `runtime resource ${index} must pin a lowercase SHA-256`);
  });
  add(JSON.stringify(importedUrls(html)) === JSON.stringify(expected), "inline module imports must match the runtime-resource manifest exactly");
  const policies = cspValues(config);
  add(policies.length === 2 && policies.every(Boolean), "both Hosting targets must define a catch-all CSP header");
  add(policies.length === 2 && policies[0] === policies[1], "both Hosting targets must use identical CSP headers");
  expected.forEach((url) => add(policies.every((policy) => policy.includes(url)), `CSP script-src-elem must allow exact runtime URL ${url}`));
  return problems;
}

export async function verifyRuntimeResources({ root = ".", fetchImpl = fetch } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, RUNTIME_RESOURCE_MANIFEST), "utf8"));
  const staticProblems = runtimeResourceProblems({ root, manifest });
  if (staticProblems.length) throw new Error(staticProblems.join("\n"));
  const declared = new Set(manifest.resources.map((resource) => resource.url));
  for (const resource of manifest.resources) {
    let response;
    try { response = await fetchImpl(resource.url, { redirect: "follow", cache: "no-store" }); }
    catch { throw new Error(`runtime resource is unreachable: ${resource.url}`); }
    if (!response.ok) throw new Error(`runtime resource returned HTTP ${response.status}: ${resource.url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength !== resource.bytes) throw new Error(`runtime resource byte length drifted: ${resource.url}`);
    if (digest(bytes) !== resource.sha256) throw new Error(`runtime resource SHA-256 drifted: ${resource.url}`);
    const source = bytes.toString("utf8");
    const undeclared = dependencies(source, resource.url).filter((url) => !declared.has(url));
    if (undeclared.length) throw new Error(`runtime resource has undeclared dependencies: ${resource.url}`);
  }
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRuntimeResources()
    .then(() => console.log("Verified all pinned Firebase runtime resources."))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
