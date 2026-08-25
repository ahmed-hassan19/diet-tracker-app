#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedSecurityHeaders } from "./csp.mjs";

export const HEADER_PATHS = Object.freeze(["/", "/index.html", "/data.js", "/privacy.html", "/trust-missing.js"]);
export const DEFAULT_HOSTS = Object.freeze([
  "https://diet-tracker-372ca.web.app",
  "https://5asesny.web.app",
]);

export async function verifyHostingHeaders({ root = ".", hosts = DEFAULT_HOSTS, fetchImpl = fetch } = {}) {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "runtime-resources.json"), "utf8"));
  const expected = expectedSecurityHeaders(html, manifest.resources.map((resource) => resource.url));
  const failures = [];
  for (const host of hosts) {
    for (const pathname of HEADER_PATHS) {
      let response;
      try { response = await fetchImpl(host + pathname, { redirect: "manual", cache: "no-store" }); }
      catch { failures.push(`${host}${pathname} was unreachable`); continue; }
      if (response.status !== 200) failures.push(`${host}${pathname} returned HTTP ${response.status}`);
      for (const [key, value] of Object.entries(expected)) {
        if (response.headers.get(key) !== value) failures.push(`${host}${pathname} ${key} did not match`);
      }
      if (!(response.headers.get("cache-control") || "").includes("no-store")) failures.push(`${host}${pathname} must be no-store`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hosts = process.argv.slice(2);
  verifyHostingHeaders({ hosts: hosts.length ? hosts : DEFAULT_HOSTS })
    .then(() => console.log("Verified Hosting security and no-store headers."))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
