import fs from "node:fs";
import vm from "node:vm";
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
if (!/\ninitSync\(\);\s*$/.test(fs.readFileSync("public/sync.js", "utf8"))) {
  throw new Error("sync.js must end with initSync() as its final call");
}

const foods = Object.values(nutrition.MEALS)
  .flatMap((meal) => meal.opts)
  .concat(nutrition.EXTRAS, nutrition.CALREF.flatMap((group) => group.items));

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
for (const name of fs.readdirSync(".github/workflows")) {
  sparkProblems.push(...guardWorkflowText(fs.readFileSync(`.github/workflows/${name}`, "utf8")));
}
if (sparkProblems.length) {
  throw new Error(
    `Spark guard failed:\n${sparkProblems.map((s) => `  - ${s}`).join("\n")}`,
  );
}

console.log(
  `Validated ${sources.length} app scripts, ${foods.length} foods, and Firebase JSON.`,
);
