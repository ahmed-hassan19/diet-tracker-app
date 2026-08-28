import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

// calc.js is loaded alone on purpose: it is the pure layer, so anything it
// touches at load time has to resolve without state or data tables.
const source = fs.readFileSync("public/calc.js", "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

// loading alone is not enough — a free identifier inside a function nobody calls
// resolves at call time, so the boundary needs a look at the text itself
test("calc.js names no state, data table, or DOM global", () => {
  const forbidden = source.match(
    /\b(S|MEALS|EXTRAS|CALREF|WORKOUTS|DEF|getOpt|getExtra|document|window|localStorage)\b/g,
  );
  assert.equal(forbidden, null);
});

test("representative profiles retain formula outputs", () => {
  assert.deepEqual(
    { ...context.calcTargets({ sex: "m", age: 30, ht: 175, w: 90, act: 1.55, gw: 80 }) },
    { tdee: 2866, klo: 2050, khi: 2150, plo: 160, phi: 176 },
  );
  assert.deepEqual(
    { ...context.calcTargets({ sex: "f", age: 30, ht: 165, w: 70, act: 1.375, gw: 60 }) },
    { tdee: 1953, klo: 1450, khi: 1550, plo: 120, phi: 132 },
  );
});

test("bulking adds energy above maintenance", () => {
  const target = context.calcTargets({
    sex: "m",
    age: 25,
    ht: 180,
    w: 60,
    act: 1.55,
    gw: 70,
  });
  assert.equal(target.khi - target.klo, 100);
  assert.ok((target.klo + target.khi) / 2 > target.tdee);
});

test("cut target never drops below resting metabolism", () => {
  const p = { sex: "m", age: 30, ht: 180, w: 100, act: 1.2, gw: 90 };
  const bmr = 10 * p.w + 6.25 * p.ht - 5 * p.age + 5;
  const t = context.calcTargets(p);
  // the bodyweight-anchored deficit alone would prescribe 2376 - 825 = 1550
  assert.equal(t.klo, 2000);
  assert.equal(t.khi, 2100);
  assert.ok((t.klo + t.khi) / 2 >= bmr);
});

test("cut deficit tracks bodyweight, not activity", () => {
  const base = { sex: "m", age: 40, ht: 175, w: 92, gw: 82 };
  const deficit = (act) => {
    const t = context.calcTargets({ ...base, act });
    return t.tdee - (t.klo + t.khi) / 2;
  };
  // each target rounds to the nearest 50, so two activity levels can differ by
  // that much and no more. The old 20%-of-TDEE rule spread these by ~141.
  assert.ok(Math.abs(deficit(1.55) - deficit(1.9)) <= 50);
  // act 1.2 is excluded on purpose: 0.75%/week is unreachable below BMR for any
  // real body, so the floor binds there and shrinks the deficit by design.
  assert.ok(deficit(1.2) < deficit(1.55));
});

test("BMR floor is 1200 or BMR rounded upward and every band is exactly 100 kcal", () => {
  const profiles = [
    { sex: "f", age: 100, ht: 120, w: 30, act: 1.2, gw: 25 },
    { sex: "f", age: 45, ht: 160, w: 75, act: 1.2, gw: 65 },
    { sex: "m", age: 30, ht: 180, w: 100, act: 1.2, gw: 90 },
    { sex: "m", age: 25, ht: 190, w: 130, act: 1.725, gw: 115 },
  ];
  for (const p of profiles) {
    const bmr = 10 * p.w + 6.25 * p.ht - 5 * p.age + (p.sex === "m" ? 5 : -161);
    const target = context.calcTargets(p);
    assert.ok(target.klo >= Math.max(1200, Math.ceil(bmr / 50) * 50));
    assert.equal(target.khi - target.klo, 100);
  }
});

test("maintenance, gain, and cut preserve the product energy adaptations", () => {
  const base = { sex: "m", age: 32, ht: 178, w: 82, act: 1.55 };
  const maintain = context.calcTargets({ ...base, gw: 82 });
  const gain = context.calcTargets({ ...base, gw: 90 });
  const cut = context.calcTargets({ ...base, gw: 72 });
  assert.ok(Math.abs((maintain.klo + maintain.khi) / 2 - maintain.tdee) <= 25);
  assert.ok(Math.abs((gain.klo + gain.khi) / 2 - (gain.tdee + 300)) <= 25);
  assert.ok(Math.abs((cut.tdee - (cut.klo + cut.khi) / 2) - 8.25 * base.w) <= 25);
});

test("rate band follows the effective calorie target including the BMR floor", () => {
  const floorBound = context.calcTargets({
    sex: "m", age: 30, ht: 180, w: 100, act: 1.2, gw: 90,
  });
  assert.deepEqual(
    { ...context.rateBand(floorBound.tdee, floorBound.klo, floorBound.khi) },
    { lo: "0.25", hi: "0.34" },
  );

  const capped = context.calcTargets({
    sex: "m", age: 30, ht: 230, w: 300, act: 1.55, gw: 200,
  });
  assert.deepEqual(
    { ...context.rateBand(capped.tdee, capped.klo, capped.khi) },
    { lo: "0.96", hi: "1.05" },
  );
});

test("rate band rejects invalid inputs and does not label a surplus as loss", () => {
  assert.equal(context.rateBand(2000, 2100, 2200), null);
  assert.equal(context.rateBand(NaN, 1800, 1900), null);
});

test("calculated targets keep supported profiles valid and reject out-of-band energy", () => {
  const proteinCapped = context.calcTargets({
    sex: "m",
    age: 30,
    ht: 180,
    w: 140,
    act: 1.55,
    gw: 138,
  });
  assert.equal(proteinCapped.phi, 300);
  assert.equal(context.validTargets(proteinCapped), true);

  const outOfBand = context.calcTargets({
    sex: "m",
    age: 18,
    ht: 230,
    w: 300,
    act: 1.9,
    gw: 100,
  });
  assert.ok(outOfBand.khi > 6000);
  assert.equal(context.validTargets(outOfBand), false);
});

test("basis weight averages only the last 14 days", () => {
  const series = [
    { date: "2026-07-01", w: 92 },
    { date: "2026-07-25", w: 88 },
    { date: "2026-07-29", w: 87 },
  ];
  assert.equal(context.basisWeight(series, "2026-07-30"), 87.5);
});

test("basis weight falls back to the last weigh-in when the window is empty", () => {
  const stale = [{ date: "2026-01-05", w: 101 }];
  assert.equal(context.basisWeight(stale, "2026-07-30"), 101);
  assert.equal(context.basisWeight([], "2026-07-30"), null);
});

test("stale-target prompt fires only after a full rounding step", () => {
  assert.equal(context.targetsMoved({ klo: 1800 }, { klo: 1750 }), true);
  assert.equal(context.targetsMoved({ klo: 1800 }, { klo: 1751 }), false);
});

test("profile validation enforces adult and BMI limits", () => {
  const valid = { sex: "f", act: 1.375, age: 18, ht: 170, w: 70, gw: 65 };
  assert.equal(context.validProfile(valid), true);
  assert.equal(context.validProfile({ ...valid, sex: "" }), false);
  assert.equal(context.validProfile({ ...valid, act: NaN }), false);
  assert.equal(
    context.validProfile({ ...valid, age: 17 }),
    false,
  );
  assert.equal(
    context.validProfile({ ...valid, age: 30, gw: 40 }),
    false,
  );
});

test("custom targets enforce supported ranges and ordering", () => {
  assert.equal(
    context.validTargets({ klo: 1200, khi: 1300, plo: 40, phi: 50 }),
    true,
  );
  assert.equal(
    context.validTargets({ klo: 1199, khi: 1300, plo: 40, phi: 50 }),
    false,
  );
  assert.equal(
    context.validTargets({ klo: 1400, khi: 1300, plo: 40, phi: 50 }),
    false,
  );
  assert.equal(
    context.validTargets({ klo: 1400, khi: 1500, plo: 80, phi: 70 }),
    false,
  );
});

test("macro mismatch warns beyond ten percent", () => {
  assert.equal(context.macroMismatch({ k: 100, p: 10, f: 4, c: 6 }), false);
  assert.equal(context.macroMismatch({ k: 300, p: 10, f: 4, c: 6 }), true);
});

test("ISO week-year helper handles year boundaries in UTC", () => {
  assert.equal(context.isoWeekYear("2020-12-31"), "2020-W53");
  assert.equal(context.isoWeekYear("2021-01-01"), "2020-W53");
  assert.equal(context.isoWeekYear("2024-12-30"), "2025-W01");
  assert.equal(context.isoWeekYear("2025-01-01"), "2025-W01");
  assert.equal(context.isoWeekYear("2025-02-30"), null);
});
