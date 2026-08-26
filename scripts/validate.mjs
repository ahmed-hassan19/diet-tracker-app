import fs from "node:fs";
import vm from "node:vm";
import { iconProblems } from "./generate-icons.mjs";
import { versionContractProblems } from "./version-contract.mjs";
import { securityHeaderProblems } from "./csp.mjs";
import { runtimeResourceProblems } from "./runtime-resources.mjs";
import {
  guardAiModule,
  guardDependencies,
  guardFirebaseClient,
  guardFirebaseConfig,
  guardFirebaseRc,
  guardFirestoreIndexes,
  guardWorkflowText,
} from "./spark-guard.mjs";

const html = fs.readFileSync("public/index.html", "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];

const inline = scripts.filter((m) => m[1].trim());
if (inline.length !== 1) {
  throw new Error(`Expected 1 inline script block, found ${inline.length}`);
}
if (!/<script type="module">/.test(inline[0][0])) {
  throw new Error("The remaining inline block should be the AI module");
}

const sources = [...html.matchAll(/<script src="\.\/([^"]+\.js)"><\/script>/g)].map(
  (m) => m[1],
);
const expectedSources = ["data.js", "calc.js", "state.js", "render.js", "sync.js"];
if (JSON.stringify(sources) !== JSON.stringify(expectedSources)) {
  throw new Error(`Classic script order must be ${expectedSources.join(", ")}`);
}

for (const name of sources) {
  const path = `public/${name}`;
  if (!fs.existsSync(path)) {
    throw new Error(`index.html references missing ${path}`);
  }
  new Function(fs.readFileSync(path, "utf8"));
}

const nutrition = { console };
vm.createContext(nutrition);
// data.js declares its literals with const, which stays lexical — hand them out explicitly
vm.runInContext(
  `${fs.readFileSync("public/data.js", "utf8")}
Object.assign(globalThis, { MEALS, EXTRAS, CALREF });`,
  nutrition,
);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const contractProblems = versionContractProblems();
if (contractProblems.length) {
  throw new Error(`Version contract failed:\n${contractProblems.map((s) => `  - ${s}`).join("\n")}`);
}

const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
const requiredManifest = {
  lang: "ar", dir: "rtl", id: "/", start_url: "/", scope: "/",
  display: "standalone", background_color: "#0e141b", theme_color: "#0e141b",
};
for (const [key, value] of Object.entries(requiredManifest)) {
  if (manifest[key] !== value) throw new Error(`manifest.webmanifest ${key} must be ${value}`);
}
if (typeof manifest.name !== "string" || !manifest.name || typeof manifest.short_name !== "string" || !manifest.short_name) {
  throw new Error("manifest.webmanifest needs name and short_name");
}
const expectedIcons = [180, 192, 512].map((size) => ({
  src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any",
}));
if (JSON.stringify(manifest.icons) !== JSON.stringify(expectedIcons)) {
  throw new Error("manifest.webmanifest must reference the three generated PNG icons");
}
const generatedIconProblems = iconProblems();
if (generatedIconProblems.length) throw new Error(generatedIconProblems.join("\n"));
if (!/<link rel="manifest" href="\/manifest\.webmanifest">/.test(html) ||
    !/<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/icon-180\.png">/.test(html)) {
  throw new Error("index.html must link the web manifest and Apple touch icon");
}
const publicNames = fs.readdirSync("public", { recursive: true }).map(String);
const allClientText = html + sources.map((name) => fs.readFileSync(`public/${name}`, "utf8")).join("\n");
const classicClientText = sources.map((name) => fs.readFileSync(`public/${name}`, "utf8")).join("\n");
if (/\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML\b|document\.write\b|<svg\b/i.test(classicClientText)) {
  throw new Error("Classic scripts must build dynamic UI with DOM nodes, never HTML or SVG strings");
}
if (/\bon(?:click|change|input)\s*=/.test(classicClientText)) {
  throw new Error("Classic scripts must attach dynamic handlers with addEventListener");
}
if (publicNames.some((name) => /(?:^|\/)s(?:ervice)?w(?:\.|$)|service-worker/i.test(name)) ||
    /navigator\.serviceWorker|serviceWorker\.register|registerServiceWorker/.test(allClientText)) {
  throw new Error("Offline-first launch is unsupported; service-worker files and registration are forbidden");
}
if (!/\ninitSync\(\);\s*$/.test(fs.readFileSync("public/sync.js", "utf8"))) {
  throw new Error("sync.js must end with initSync() as its final call");
}

const foods = Object.values(nutrition.MEALS)
  .flatMap((meal) => meal.opts)
  .concat(nutrition.EXTRAS, nutrition.CALREF.flatMap((group) => group.items));

if (foods.length !== 75) {
  throw new Error(`Expected 75 built-in nutrition entries, found ${foods.length}`);
}

const ledger = JSON.parse(fs.readFileSync("public/nutrition-sources.json", "utf8"));
const runtimeEntries = [];
for (const [key, meal] of Object.entries(nutrition.MEALS)) meal.opts.forEach((food, index) => runtimeEntries.push({ id: `meals.${key}.${index}`, food }));
nutrition.EXTRAS.forEach((food, index) => runtimeEntries.push({ id: `extras.${index}`, food }));
nutrition.CALREF.forEach((group, groupIndex) => group.items.forEach((food, index) => runtimeEntries.push({ id: `calref.${groupIndex}.${index}`, food })));
if (ledger.schemaVersion !== 1 || ledger.inventoryCount !== 75 || ledger.entries?.length !== 75) throw new Error("Nutrition ledger must declare schema 1 and exactly 75 entries");
if (new Set(ledger.entries.map((entry) => entry.id)).size !== 75) throw new Error("Nutrition ledger path IDs must be unique");
for (let index = 0; index < runtimeEntries.length; index++) {
  const { id, food } = runtimeEntries[index], entry = ledger.entries[index];
  if (entry.id !== id || entry.title !== food.t || ["k", "p", "f", "c"].some((key) => entry[key] !== food[key])) throw new Error(`Nutrition ledger drifted from runtime at ${id}`);
  if (!entry.preparation || !entry.servingBasis || !entry.conversion || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewDate) || !entry.sourceIds?.length) throw new Error(`Nutrition ledger evidence is incomplete at ${id}`);
  for (const sourceId of entry.sourceIds) if (!ledger.sources?.[sourceId] || !/^https:\/\//.test(ledger.sources[sourceId].url)) throw new Error(`Nutrition ledger source is missing at ${id}`);
  for (const component of entry.components || []) {
    if (!(component.amountG > 0) || !entry.sourceIds.includes(component.sourceId) || !ledger.sources[component.sourceId]) throw new Error(`Nutrition ledger component is incomplete at ${id}`);
  }
}
const legacyPaths = ledger.entries.filter((entry) => entry.legacy).map((entry) => entry.id);
if (JSON.stringify(legacyPaths) !== JSON.stringify(["meals.pw.0", "meals.nt.0", "meals.nt.1"])) throw new Error("Nutrition ledger legacy paths drifted");
if (ledger.entries.filter((entry) => !entry.legacy && entry.reviewOutcome === "recalculated").length !== 72) throw new Error("Nutrition ledger must mark all 72 current entries as recalculated");
if (Object.keys(ledger.sources).some((id) => id.includes("method"))) throw new Error("Nutrition ledger cannot use a methodology page as a food source");
const fnddsUrl = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip";
for (const [id, source] of Object.entries(ledger.sources)) if (source.fdcId !== undefined && (id !== `fdc-${source.fdcId}` || source.url !== fnddsUrl || source.datasetSourceId !== "fndds-download")) throw new Error(`Nutrition ledger FNDDS binding is invalid at ${id}`);

const mismatches = foods.filter((food) => {
  const macroCalories = food.p * 4 + food.f * 9 + food.c * 4;
  return food.k > 0 && Math.abs(food.k - macroCalories) / food.k > 0.1;
});

if (mismatches.length) {
  throw new Error(
    `Macro reconciliation failed: ${mismatches.map((food) => food.t).join(", ")}`,
  );
}

const sparkProblems = [
  ...guardAiModule(inline[0][1], { version: pkg.version }),
  ...guardFirebaseClient(html + sources.map((name) => fs.readFileSync(`public/${name}`, "utf8")).join("\n")),
];
for (const file of ["firebase.json", ".firebaserc"]) {
  JSON.parse(fs.readFileSync(file, "utf8"));
}
sparkProblems.push(
  ...guardFirebaseConfig(JSON.parse(fs.readFileSync("firebase.json", "utf8"))),
  ...guardFirebaseRc(JSON.parse(fs.readFileSync(".firebaserc", "utf8"))),
  ...guardFirestoreIndexes(JSON.parse(fs.readFileSync("firestore.indexes.json", "utf8"))),
  ...guardDependencies(JSON.parse(fs.readFileSync("package.json", "utf8"))),
);
sparkProblems.push(...securityHeaderProblems(), ...runtimeResourceProblems());
for (const name of fs.readdirSync(".github/workflows")) {
  sparkProblems.push(...guardWorkflowText(fs.readFileSync(`.github/workflows/${name}`, "utf8")));
}
if (sparkProblems.length) {
  throw new Error(
    `Spark guard failed:\n${sparkProblems.map((s) => `  - ${s}`).join("\n")}`,
  );
}

console.log(`Validated ${sources.length} app scripts, ${foods.length} foods, safe DOM sinks, CSP, runtime resources, install assets, version contract, and Firebase JSON.`);
