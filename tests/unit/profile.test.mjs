import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (file) => fs.readFileSync(`public/${file}`, "utf8");

// data.js runs console.assert at load, so the context needs a console
const context = { console };
vm.createContext(context);
vm.runInContext(`${read("data.js")}\n${read("calc.js")}`, context);

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
    { tdee: 3220, klo: 2550, khi: 2650, plo: 172, phi: 189 },
  );
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
