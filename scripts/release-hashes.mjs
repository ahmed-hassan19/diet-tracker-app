#!/usr/bin/env node

import { bundleDetails, taggedConfigHashes } from "./release-lib.mjs";

const hashes = taggedConfigHashes();
if (process.argv[2] === "--bundle-list") {
  process.stdout.write(bundleDetails().lines);
} else if (process.argv[2] === "--file-list0") {
  process.stdout.write(bundleDetails().files.map((file) => `public/${file}\0`).join(""));
} else if (process.argv[2] === "--verify") {
  const expected = {
    bundleSha256: process.env.EXPECTED_BUNDLE,
    rulesetSha256: process.env.EXPECTED_RULESET,
    indexesSha256: process.env.EXPECTED_INDEXES,
    runtimeResourcesSha256: process.env.EXPECTED_RUNTIME_RESOURCES,
    hostingHeadersSha256: process.env.EXPECTED_HOSTING_HEADERS,
  };
  for (const [key, actual] of Object.entries(hashes)) {
    if (!expected[key] || expected[key] !== actual) {
      console.error(`tagged ${key} ${actual} != deployment record ${expected[key] || "<missing>"}`);
      process.exit(1);
    }
  }
  console.log("Tagged bundle, Rules, indexes, runtime resources, and Hosting headers match the deployment record.");
} else {
  console.log(JSON.stringify(hashes, null, 2));
}
