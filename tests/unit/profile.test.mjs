import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

// calc.js is loaded alone on purpose: it is the pure layer, so anything it
// touches at load time has to resolve without state or data tables.
// Its load-time console.assert IIFE still needs a console.
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

test("reviewed profile retains its approved targets", () => {
  assert.deepEqual(
    {
      ...context.calcTargets({
        sex: "m",
        age: 29,
        ht: 186,
        w: 105.5,
        act: 1.55,
        gw: 86,
      }),
    },
    { tdee: 3220, klo: 2300, khi: 2400, plo: 172, phi: 189 },
  );
});

test("reviewed profile at its current weight lands on the recommended band", () => {
  const t = context.calcTargets({
    sex: "m",
    age: 29,
    ht: 186,
    w: 99.6,
    act: 1.55,
    gw: 86,
  });
  assert.equal(t.klo, 2250);
  assert.equal(t.khi, 2350);
});

test("cut target never drops below resting metabolism", () => {
  const p = { sex: "m", age: 30, ht: 180, w: 100, act: 1.2, gw: 90 };
  const bmr = 10 * p.w + 6.25 * p.ht - 5 * p.age + 5;
  const t = context.calcTargets(p);
  // the bodyweight-anchored deficit alone would prescribe 2376 - 825 = 1550
  assert.equal(t.klo, 1950);
  assert.equal(t.khi, 2050);
  assert.ok((t.klo + t.khi) / 2 >= bmr);
});

test("cut deficit tracks bodyweight, not activity", () => {
  const base = { sex: "m", age: 29, ht: 186, w: 99.6, gw: 86 };
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

test("profile validation enforces adult and BMI limits", () => {
  assert.equal(context.validProfile({ age: 18, ht: 170, w: 70, gw: 65 }), true);
  assert.equal(
    context.validProfile({ age: 17, ht: 170, w: 70, gw: 65 }),
    false,
  );
  assert.equal(
    context.validProfile({ age: 30, ht: 170, w: 70, gw: 40 }),
    false,
  );
});

test("custom targets enforce safe ranges and ordering", () => {
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
