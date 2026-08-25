import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ICON_SIZES, iconPng } from "../../scripts/generate-icons.mjs";

const html = fs.readFileSync("public/index.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));

test("hosted-install metadata is Arabic, RTL, rooted, and standalone", () => {
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#0e141b");
  assert.equal(manifest.background_color, "#0e141b");
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/icons\/icon-180\.png"/);
});

test("all icon files are exact deterministic PNG outputs with declared dimensions", () => {
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ICON_SIZES.map((size) => `${size}x${size}`));
  for (const size of ICON_SIZES) {
    const bytes = fs.readFileSync(`public/icons/icon-${size}.png`);
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.deepEqual(bytes, iconPng(size));
  }
});

test("offline-first behavior stays explicitly unsupported", () => {
  const files = fs.readdirSync("public", { recursive: true }).map(String);
  const scripts = ["data.js", "calc.js", "state.js", "render.js", "sync.js"]
    .map((file) => fs.readFileSync(`public/${file}`, "utf8")).join("\n");
  assert.equal(files.some((file) => /(?:^|\/)s(?:ervice)?w(?:\.|$)|service-worker/i.test(file)), false);
  assert.doesNotMatch(html + scripts, /navigator\.serviceWorker|serviceWorker\.register|registerServiceWorker/);
  assert.match(html, /التشغيل من غير إنترنت مش مدعوم/);
});
