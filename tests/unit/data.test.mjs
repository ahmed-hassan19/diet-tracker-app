import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { console };
vm.createContext(context);
vm.runInContext(
  `${fs.readFileSync("public/data.js", "utf8")}
Object.assign(globalThis, { MEALS, PLAN_TEMPLATES, CALREF });`,
  context,
);
vm.runInContext(fs.readFileSync("public/calc.js", "utf8"), context);

const plain = (value) => JSON.parse(JSON.stringify(value));
const templateTotals = (picks) =>
  Object.entries(picks).reduce(
    (sum, [key, index]) => {
      const food = context.MEALS[key].opts[index];
      sum.k += food.k;
      sum.p += food.p;
      sum.f += food.f;
      sum.c += food.c;
      return sum;
    },
    { k: 0, p: 0, f: 0, c: 0 },
  );

test("existing meal option indexes retain the same foods", () => {
  const expected = {
    b: [
      "٣ بيضات + ٣ توست أسمر + خيار وطماطم",
      "٢٥٠ جم جبنة قريش + ٣ توست أسمر + ملعقة صغيرة زيت زيتون + خيار",
      "٧٠ جم شوفان + ٣٠٠ مل لبن قليل الدسم + نص سكوب واي",
      "٧ ملاعق فول + ٣ بيضات مسلوقة + ١ توست أسمر",
    ],
    bc: ["نيسكافيه Coffee Break 2×1 (ظرف ١٢ جم) + سويتال"],
    s: [
      "زبادي يوناني عالي البروتين (١٧٠ جم) + تفاحة + ١٠ جم لوز",
      "٢٠٠ جم زبادي قليل الدسم + ٢٠ جم لوز",
      "١٥٠ جم جبنة قريش + ١ توست أسمر + طماطم",
      "كوب لبن قليل الدسم (٢٥٠ مل) + ٢٥ جم فول سوداني",
    ],
    l: [
      "٢٠٠ جم صدور فراخ مشوية + ٣٠٠ جم رز مطبوخ + سلطة + ١٠ جم زيت",
      "٢٢٠ جم سمك مشوي + ٤٠٠ جم بطاطس مسلوقة + سلطة + ١٠ جم زيت",
      "٢٠٠ جم لحم أحمر قليل الدهن + ٢٥٠ جم رز مطبوخ + خضار سوتيه",
    ],
    cf: ["قهوة بن أرابيكا وسط سادة + سويتال"],
    pw: [
      "سكوب واي بروتين بالمياه + موزة",
      "علبة تونة لايت مصفاة (~١٠٠ جم) + ١ توست أسمر",
      "٢٠٠ جم جبنة قريش + تفاحة",
      "٢٥٠ جم زبادي يوناني عالي البروتين + موزة",
    ],
    d: [
      "٢٥٠ جم جبنة قريش + سلطة + ملعقة صغيرة زيت زيتون + ٢ توست أسمر",
      "٣ بيضات + ١٥٠ جم جبنة قريش + خضار + ١ توست أسمر",
      "علبة تونة مصفاة + ٢٥٠ جم بطاطس مسلوقة + ٢ توست + سلطة بملعقة صغيرة زيت",
      "٢٥٠ جم زبادي يوناني عالي البروتين + ٣٠ جم لوز + ٤٠ جم شوفان",
    ],
  };

  for (const [key, titles] of Object.entries(expected)) {
    assert.deepEqual(
      plain(context.MEALS[key].opts.map((food) => food.t)),
      titles,
    );
  }
});

test("Nitro-Tech options and calorie reference use the exact label macros", () => {
  assert.deepEqual(plain(context.MEALS.nt.opts), [
    {
      t: "سكوب Nitro-Tech (٤٤ جم) بالمياه + موزة",
      k: 246,
      p: 31,
      f: 2.5,
      c: 26,
    },
    {
      t: "سكوب Nitro-Tech (٤٤ جم) + ٢٥٠ مل لبن قليل الدسم",
      k: 270,
      p: 38,
      f: 6.5,
      c: 15,
    },
  ]);

  const product = context.CALREF.flatMap((group) => group.items).find((food) =>
    food.t.startsWith("سكوب Nitro-Tech"),
  );
  assert.deepEqual(plain(product), {
    t: "سكوب Nitro-Tech (٤٤ جم) — شامل ٣ جم كرياتين",
    k: 150,
    p: 30,
    f: 2.5,
    c: 3,
  });
});

test("daily templates total the actual selected meal options", () => {
  const expected = [
    { k: 2307, p: 184, f: 75.5, c: 224 },
    { k: 2301, p: 186, f: 65.5, c: 242 },
    { k: 2286, p: 186, f: 66.5, c: 237 },
  ];

  assert.equal(context.PLAN_TEMPLATES.length, 3);
  context.PLAN_TEMPLATES.forEach((template, index) => {
    assert.deepEqual(Object.keys(template.picks), ["b", "s", "l", "nt", "d"]);
    assert.deepEqual(templateTotals(template.picks), expected[index]);
  });
});

test("daily templates fit the current target and preferred macro bands", () => {
  const profile = { sex: "m", age: 29, ht: 186, w: 99.1, act: 1.55, gw: 86 };
  const bmr = 10 * profile.w + 6.25 * profile.ht - 5 * profile.age + 5;
  const targets = plain(context.calcTargets(profile));
  const hints = plain(context.macroHints(targets));

  assert.equal(bmr, 2013.5);
  assert.deepEqual(targets, {
    tdee: 3121,
    klo: 2250,
    khi: 2350,
    plo: 172,
    phi: 189,
  });
  assert.deepEqual(hints, { flo: 64, fhi: 77, clo: 221, chi: 251 });

  context.PLAN_TEMPLATES.forEach((template) => {
    const total = templateTotals(template.picks);
    assert.ok(total.k >= targets.klo && total.k <= targets.khi);
    assert.ok(total.p >= targets.plo && total.p <= targets.phi);
    assert.ok(total.f >= hints.flo && total.f <= hints.fhi);
    assert.ok(total.c >= hints.clo && total.c <= hints.chi);
  });
});

test("new Nitro-Tech foods reconcile calories and macros within ten percent", () => {
  const foods = [
    ...context.MEALS.nt.opts,
    ...context.CALREF.flatMap((group) => group.items).filter((food) =>
      food.t.startsWith("سكوب Nitro-Tech"),
    ),
  ];

  foods.forEach((food) => {
    const macroCalories = food.p * 4 + food.f * 9 + food.c * 4;
    assert.ok(Math.abs(food.k - macroCalories) / food.k <= 0.1, food.t);
  });
});
