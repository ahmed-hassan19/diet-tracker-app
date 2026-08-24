import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { console };
vm.createContext(context);
vm.runInContext(
  `${fs.readFileSync("public/data.js", "utf8")}
Object.assign(globalThis, { MEALS, EXTRAS, CALREF, DEF });`,
  context,
);

const plain = (value) => JSON.parse(JSON.stringify(value));

test("fallback settings use neutral validation boundaries", () => {
  assert.deepEqual(plain(context.DEF), {
    name: "",
    sex: "",
    age: 0,
    ht: 0,
    act: 0,
    klo: 1200,
    khi: 1200,
    plo: 40,
    phi: 40,
    sw: 0,
    gw: 0,
    tw: 0,
  });
});

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
    nt: [
      "سكوب Nitro-Tech (٤٤ جم) بالمياه + موزة",
      "سكوب Nitro-Tech (٤٤ جم) + ٢٥٠ مل لبن قليل الدسم",
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

test("legacy generic whey stays at its saved index but is not a new-day choice", () => {
  assert.equal(context.MEALS.pw.opts[0].legacyOnly, true);
  assert.match(context.MEALS.pw.name, /قبل التمرين بـ٦٠–١٢٠ دقيقة/);
});

test("legacy product meal retains its saved indexes and exact macros", () => {
  assert.equal(context.MEALS.nt.legacyOnly, true);
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

  assert.equal(
    context.CALREF.flatMap((group) => group.items).some((food) =>
      food.t.includes("Nitro-Tech"),
    ),
    false,
  );
});

test("all 75 built-in nutrition entries reconcile calories and macros", () => {
  const foods = Object.values(context.MEALS)
    .flatMap((meal) => meal.opts)
    .concat(
      context.EXTRAS,
      context.CALREF.flatMap((group) => group.items),
    );

  assert.equal(foods.length, 75);
  foods.forEach((food) => {
    const macroCalories = food.p * 4 + food.f * 9 + food.c * 4;
    assert.ok(Math.abs(food.k - macroCalories) / food.k <= 0.1, food.t);
  });
});
