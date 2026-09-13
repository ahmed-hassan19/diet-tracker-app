import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  // workers must stay at 1: parallel workers share one Auth emulator and race
  // its account registry, producing transient HTTP 400s (16/18 with four).
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "line",
  use: {
    baseURL: "http://127.0.0.1:5005",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // These viewport-independent contracts retain complete desktop coverage.
      // New tests run on both viewports unless explicitly excluded here.
      grepInvert: /shows the quota fallback copy|modular Firebase bridge is narrow|renders the runtime version and hosted-install resources|legacy product choices stay hidden|legacy generic whey stays hidden|pre-3\.11\.1 coffee and honey|progress rate follows the current calorie deficit|change-from-start measures|legacy notice fields are scrubbed|imported and remote legacy formula states|rolls back parse, UTF-8, count|accepts a durable warning-size import|migrates verified legacy storage|keeps memory and recovery available through IndexedDB quota|keeps cloud recovery and export usable when app IndexedDB access is denied|quarantines malformed remote state|serves CSP and security headers|empty and single-weight charts/,
    },
  ],
});
