import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { console };
vm.createContext(context);
vm.runInContext(
  `${fs.readFileSync("public/data.js", "utf8")}
Object.assign(globalThis, { MEALS, rankedExampleDays });`,
  context,
);
const plain = (value) => JSON.parse(JSON.stringify(value));
const targets = { klo: 1950, khi: 2050, plo: 160, phi: 176 };

test("the four explicit core groups produce all 192 unique built-in combinations", () => {
  assert.deepEqual(
    Object.entries(context.MEALS).filter(([, meal]) => meal.examples).map(([key]) => key),
    ["b", "s", "l", "d"],
  );
  const all = plain(context.rankedExampleDays(targets, 192));
  assert.equal(all.length, 192);
  assert.equal(new Set(all.map((day) => day.signature)).size, 192);
  all.forEach((day) => {
    assert.deepEqual(day.picks.map((pick) => pick.key), ["b", "s", "l", "d"]);
    day.picks.forEach(({ key, index }) => {
      assert.equal(Number.isInteger(index), true);
      assert.equal(context.MEALS[key].opts[index].legacyOnly, undefined);
    });
  });
});

test("ranking uses midpoint distance and deterministic documented tie breakers", () => {
  const all = plain(context.rankedExampleDays(targets, 192));
  const km = 2000;
  const pm = 168;
  const ranked = [...all].sort((a, b) => {
    const ak = Math.abs(a.total.k - km), bk = Math.abs(b.total.k - km);
    const ap = Math.abs(a.total.p - pm), bp = Math.abs(b.total.p - pm);
    return ((ak / km) ** 2 + (ap / pm) ** 2) - ((bk / km) ** 2 + (bp / pm) ** 2) ||
      ak - bk || ap - bp || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0);
  });
  assert.deepEqual(all, ranked);
  assert.deepEqual(plain(context.rankedExampleDays(targets)), all.slice(0, 3));
  for (let i = 1; i < all.length; i++) {
    if (all[i - 1].distance === all[i].distance &&
        Math.abs(all[i - 1].total.k - km) === Math.abs(all[i].total.k - km) &&
        Math.abs(all[i - 1].total.p - pm) === Math.abs(all[i].total.p - pm)) {
      assert.ok(all[i - 1].signature.localeCompare(all[i].signature, "en") <= 0);
    }
  }
});

test("a deliberate full tie resolves by the stable key:index signature", () => {
  const total = (b) => [context.MEALS.b.opts[b], context.MEALS.s.opts[0], context.MEALS.l.opts[0], context.MEALS.d.opts[0]]
    .reduce((sum, food) => ({ k: sum.k + food.k, p: sum.p + food.p }), { k: 0, p: 0 });
  const left = total(0), right = total(1);
  const tiedTargets = {
    klo: (left.k + right.k) / 2,
    khi: (left.k + right.k) / 2,
    plo: (left.p + right.p) / 2,
    phi: (left.p + right.p) / 2,
  };
  const signatures = plain(context.rankedExampleDays(tiedTargets, 192)).map((day) => day.signature);
  assert.ok(signatures.indexOf("b:0|s:0|l:0|d:0") < signatures.indexOf("b:1|s:0|l:0|d:0"));
});

test("midpoint changes rerank examples without reading or mutating state", () => {
  const before = plain(context.rankedExampleDays(targets));
  context.S = { foods: { b: [{ t: "custom", k: 2000, p: 2000, f: 0, c: 0 }] } };
  const after = plain(context.rankedExampleDays({ klo: 1450, khi: 1550, plo: 90, phi: 100 }));
  assert.notDeepEqual(after.map((day) => day.signature), before.map((day) => day.signature));
  assert.deepEqual(context.S, { foods: { b: [{ t: "custom", k: 2000, p: 2000, f: 0, c: 0 }] } });
  assert.equal(after.some((day) => day.picks.some((pick) => pick.key === "bc" || pick.key === "cf" || pick.key === "pw" || pick.key === "nt")), false);
  assert.equal(after.some((day) => day.signature.includes("c")), false);
});

test("totals retain source values and invalid requests fail closed", () => {
  const [day] = plain(context.rankedExampleDays(targets, 1));
  const expected = day.picks.reduce((sum, { key, index }) => {
    const food = context.MEALS[key].opts[index];
    for (const macro of ["k", "p", "f", "c"]) sum[macro] += food[macro] || 0;
    return sum;
  }, { k: 0, p: 0, f: 0, c: 0 });
  assert.deepEqual(day.total, expected);
  for (const invalid of [null, {}, { ...targets, klo: 0 }, { ...targets, klo: 2100, khi: 2000 }, { ...targets, phi: NaN }]) {
    assert.deepEqual(plain(context.rankedExampleDays(invalid)), []);
  }
  assert.deepEqual(plain(context.rankedExampleDays(targets, -1)), []);
});
