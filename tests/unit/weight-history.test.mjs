import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(fs.readFileSync("public/calc.js", "utf8"), context);
const stats = weights => JSON.parse(JSON.stringify(context.weightHistoryStats(weights)));

test("weight history compares recorded days and adjacent calendar-week averages", () => {
  const weights = [
    { date: "2026-09-02", w: 82.4 },
    { date: "2026-08-24", w: 85 },
    { date: "2026-08-25", w: 84 },
    { date: "2026-08-31", w: 83 },
    { date: "2026-09-14", w: 82 },
  ];
  const before = JSON.stringify(weights), result = stats(weights);
  assert.equal(JSON.stringify(weights), before);
  assert.equal(result.points[0].delta, null);
  assert.equal(result.points[0].previousDate, null);
  assert.equal(result.points[1].delta, -1);
  assert.equal(result.points[2].previousDate, "2026-08-25");
  assert.equal(result.points[2].delta, -1);
  assert.equal(result.points[3].previousDate, "2026-08-31");
  assert.ok(Math.abs(result.points[3].delta + 0.6) < 1e-10);
  assert.equal(result.weeks[0].average, 84.5);
  assert.ok(Math.abs(result.weeks[1].average - 82.7) < 1e-10);
  assert.ok(Math.abs(result.points[2].weeklyDelta + 1.8) < 1e-10);
  assert.equal(result.points[2].weeklyDelta, result.points[3].weeklyDelta);
  assert.equal(result.points[4].weeklyDelta, null);
  assert.equal(result.weeks[2].delta, null);
});

test("ISO week averages span year boundaries and include partial weeks", () => {
  const result = stats([
    { date: "2020-12-28", w: 80 },
    { date: "2021-01-01", w: 82 },
    { date: "2021-01-04", w: 83 },
  ]);
  assert.deepEqual(result.weeks, [
    { week: "2020-W53", average: 81, delta: null },
    { week: "2021-W01", average: 83, delta: 2 },
  ]);
  assert.equal(result.points[2].delta, 1);
  assert.equal(result.points[2].weeklyDelta, 2);
});

test("empty, single-point, and unchanged histories have no invented comparisons", () => {
  assert.deepEqual(stats([]), { points: [], weeks: [] });
  const single = stats([{ date: "2026-08-24", w: 80 }]);
  assert.equal(single.points[0].delta, null);
  assert.equal(single.points[0].weeklyDelta, null);
  const same = stats([{ date: "2026-08-24", w: 80 }, { date: "2026-08-31", w: 80 }]);
  assert.equal(same.points[1].delta, 0);
  assert.equal(same.points[1].weeklyDelta, 0);
});
