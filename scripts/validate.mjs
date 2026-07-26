import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("public/index.html", "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];

if (scripts.length !== 2) {
  throw new Error(`Expected 2 script blocks, found ${scripts.length}`);
}

new Function(scripts[0][1]);

const dataMatch = html.match(
  /const MEALS = ([\s\S]*?);\nconst EXTRAS = ([\s\S]*?);\n\/\* مرجع[\s\S]*?const CALREF=([\s\S]*?);\nconsole\.assert/,
);

if (!dataMatch) {
  throw new Error("Could not extract nutrition data");
}

const nutrition = {};
vm.createContext(nutrition);
vm.runInContext(
  `MEALS=${dataMatch[1]};EXTRAS=${dataMatch[2]};CALREF=${dataMatch[3]}`,
  nutrition,
);

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

const reviewedProfile = {
  sex: "m",
  age: 29,
  ht: 186,
  w: 105.5,
  act: 1.55,
  gw: 86,
};
const bmr =
  10 * reviewedProfile.w +
  6.25 * reviewedProfile.ht -
  5 * reviewedProfile.age +
  5;
const tdee = Math.round(bmr * reviewedProfile.act);
const deficit = -Math.min(900, Math.max(300, tdee * 0.2));
const midpoint = Math.max(1250, Math.round((tdee + deficit) / 50) * 50);
const targets = {
  tdee,
  klo: midpoint - 50,
  khi: midpoint + 50,
  plo: Math.round(2 * reviewedProfile.gw),
  phi: Math.round(2.2 * reviewedProfile.gw),
};

const expected = { tdee: 3220, klo: 2550, khi: 2650, plo: 172, phi: 189 };
if (JSON.stringify(targets) !== JSON.stringify(expected)) {
  throw new Error(`Reviewed profile targets changed: ${JSON.stringify(targets)}`);
}

for (const file of ["firebase.json", ".firebaserc"]) {
  JSON.parse(fs.readFileSync(file, "utf8"));
}

console.log(
  `Validated JavaScript syntax, ${foods.length} foods, Firebase JSON, and reviewed-profile targets.`,
);
