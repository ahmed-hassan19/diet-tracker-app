import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SECURITY_HEADER_KEYS = Object.freeze([
  "Content-Security-Policy",
  "Permissions-Policy",
  "Referrer-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
]);

export const PERMISSIONS_POLICY = [
  "accelerometer", "ambient-light-sensor", "autoplay", "battery", "bluetooth",
  "browsing-topics", "camera", "clipboard-read", "clipboard-write", "display-capture",
  "encrypted-media", "fullscreen", "gamepad", "geolocation", "gyroscope", "hid",
  "identity-credentials-get", "idle-detection", "local-fonts", "magnetometer", "microphone",
  "midi", "otp-credentials", "payment", "picture-in-picture", "publickey-credentials-create",
  "publickey-credentials-get", "screen-wake-lock", "serial", "speaker-selection", "storage-access",
  "usb", "web-share", "window-management", "xr-spatial-tracking",
].map((feature) => feature === "storage-access" ?
  'storage-access=(self "https://www.google.com" "https://recaptcha.google.com")' :
  `${feature}=()`).join(", ");

const hashToken = (value) => `'sha256-${crypto.createHash("sha256").update(value).digest("base64")}'`;
export function inlineModuleSource(html) {
  const matches = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  return matches.length === 1 ? matches[0][1] : null;
}
export function staticHandlerSources(html) {
  return [...new Set([...html.matchAll(/\s(?:onclick|onchange|oninput)="([^"]+)"/g)].map((match) => match[1]))].sort();
}
export function expectedCsp(html, runtimeUrls) {
  const moduleSource = inlineModuleSource(html);
  if (moduleSource === null) throw new Error("index.html must contain exactly one inline module");
  const handlerHashes = staticHandlerSources(html).map(hashToken);
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "media-src 'none'",
    "manifest-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebasevertexai.googleapis.com https://www.googleapis.com/identitytoolkit/ https://apis.google.com/js/gen_204 https://www.google.com/recaptcha/ http://127.0.0.1:8080 http://localhost:8080 http://127.0.0.1:9099 http://localhost:9099 ws://127.0.0.1:8080 ws://localhost:8080",
    `script-src-elem 'self' ${hashToken(moduleSource)} ${runtimeUrls.join(" ")} https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://apis.google.com/js/api.js https://apis.google.com/_/scs/`,
    `script-src-attr 'unsafe-hashes' ${handlerHashes.join(" ")}`,
    "frame-src https://diet-tracker-372ca.firebaseapp.com/__/auth/ https://5asesny.web.app/__/auth/ https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ http://127.0.0.1:9099/ http://localhost:9099/",
    "worker-src 'self' blob:",
  ].join("; ");
}
export function expectedSecurityHeaders(html, runtimeUrls) {
  return {
    "Content-Security-Policy": expectedCsp(html, runtimeUrls),
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}
export function securityHeaderProblems({ root = ".", config = null, html = null, manifest = null } = {}) {
  const problems = [];
  try { config ||= JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8")); }
  catch { return ["firebase.json must be valid JSON for security-header validation"]; }
  try { html ||= fs.readFileSync(path.join(root, "public/index.html"), "utf8"); }
  catch { return ["public/index.html must be readable for security-header validation"]; }
  try { manifest ||= JSON.parse(fs.readFileSync(path.join(root, "runtime-resources.json"), "utf8")); }
  catch { return ["runtime-resources.json must be valid JSON for security-header validation"]; }
  const expected = expectedSecurityHeaders(html, (manifest.resources || []).map((resource) => resource.url));
  const sites = config.hosting || [];
  if (sites.length !== 2) return ["security headers require exactly two Hosting targets"];
  for (const site of sites) {
    const entry = (site.headers || []).find((item) => item.source === "**");
    const actual = Object.fromEntries((entry?.headers || []).map((header) => [header.key, header.value]));
    if (JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(SECURITY_HEADER_KEYS)) problems.push(`${site.target} must define exactly the five reviewed security headers on **`);
    for (const [key, value] of Object.entries(expected)) if (actual[key] !== value) problems.push(`${site.target} ${key} does not match the derived reviewed value`);
  }
  return problems;
}
