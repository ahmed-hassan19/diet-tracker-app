import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import test, { after, before } from "node:test";

let env;
const tracker = (overrides = {}) => ({ days: {}, settings: { builtinSelectionVersion: 1 }, foods: {}, calref: {}, updated: Date.now(), ...overrides });
const storedFood = (label = "أكلة") => ({ t: label, k: 100, p: 10, f: 4, c: 6 });
const days = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => {
  const date = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
  return [date, {}];
}));
async function seed(path, value) {
  await env.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), path), value));
}
async function context(uid, enabled = true) {
  await seed(`betaMembers/${uid}`, { enabled });
  return env.authenticatedContext(uid).firestore();
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "diet-tracker-372ca",
    firestore: { rules: await readFile("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(async () => env.cleanup());

test("enabled owner can create and update only canonical post-images", async () => {
  const db = await context("valid-owner"),ref = doc(db, "trackers/valid-owner");
  await assertSucceeds(setDoc(ref, tracker()));
  await assertSucceeds(updateDoc(ref, { days: { "2026-08-25": { notes: "client-validated" } }, updated: Date.now() }));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(deleteDoc(ref));
});

test("revoked and absent membership block writes but never strand owner read or delete", async () => {
  for (const [uid, enabled] of [["revoked", false], ["not-member", null]]) {
    if (enabled !== null) await seed(`betaMembers/${uid}`, { enabled });
    await seed(`trackers/${uid}`, { malformed: "legacy root" });
    const db = env.authenticatedContext(uid).firestore(),ref = doc(db, `trackers/${uid}`);
    await assertSucceeds(getDoc(ref));
    await assertFails(setDoc(ref, tracker()));
    await assertFails(updateDoc(ref, { updated: Date.now() }));
    await assertSucceeds(deleteDoc(ref));
  }
});

test("cross-user and unauthenticated tracker access is denied", async () => {
  await seed("trackers/private-owner", tracker());
  for (const db of [(await context("intruder")), env.unauthenticatedContext().firestore()]) {
    const ref = doc(db, "trackers/private-owner");
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, tracker()));
    await assertFails(deleteDoc(ref));
  }
});

test("root schema rejects missing, unknown, and wrong top-level fields", async () => {
  const db = await context("root-schema"),ref = doc(db, "trackers/root-schema");
  const cases = [
    { days: {}, settings: {}, foods: {}, updated: Date.now() },
    { ...tracker(), extra: true },
    tracker({ days: [] }), tracker({ settings: [] }), tracker({ foods: [] }), tracker({ calref: [] }),
    tracker({ updated: "now" }), tracker({ updated: 1 }), tracker({ updated: Date.now() + 600000 }),
  ];
  for (const value of cases) await assertFails(setDoc(ref, value));
});

test("settings enforce canonical keys, types, ranges, order, enums, and disclosure pairing", async () => {
  const db = await context("settings-schema"),ref = doc(db, "trackers/settings-schema");
  await assertSucceeds(setDoc(ref, tracker({ settings: {
    name: "اسم", sex: "m", age: 18, ht: 120, act: 1.2, klo: 1200, khi: 6000,
    plo: 40, phi: 300, sw: 30, gw: 300, tw: 0, _ts: Date.now(),
    targetFormulaVersion: 1, builtinSelectionVersion: 1,
    aiDisclosureVersion: 1, aiDisclosureAcceptedAt: "2026-08-25T00:00:00.000Z",
  } })));
  const invalidSettings = [
    { unknown: 1 }, { name: "x".repeat(41) }, { sex: "x" }, { age: 17 }, { age: 18.5 },
    { ht: 231 }, { act: 1.3 }, { klo: 1199 }, { khi: 6001 }, { plo: 39 }, { phi: 301 },
    { sw: 29 }, { gw: 301 }, { tw: 1 }, { klo: 2000, khi: 1900 }, { plo: 100, phi: 90 },
    { _ts: 1 }, { aiDisclosureVersion: 1 }, { aiDisclosureAcceptedAt: "time" },
    { targetFormulaVersion: 0 }, { targetFormulaVersion: 2 }, { targetFormulaVersion: 1.5 },
    { builtinSelectionVersion: 0 }, { builtinSelectionVersion: 2 }, { builtinSelectionVersion: 1.5 },
    { healthNoticeVersion: 1 }, { healthNoticeAcceptedAt: "2026-08-25T00:00:00.000Z" },
    { healthNoticeVersion: 1, healthNoticeAcceptedAt: "2026-08-25T00:00:00.000Z" },
    { aiDisclosureVersion: 2, aiDisclosureAcceptedAt: "2026-08-25T00:00:00.000Z" },
    { aiDisclosureVersion: 1, aiDisclosureAcceptedAt: "2026/08/25T00:00:00.000Z" },
  ];
  for (const settings of invalidSettings) await assertFails(setDoc(ref, tracker({ settings })));
});

test("owner can recover a readable legacy tracker through canonical replacement", async () => {
  const uid="legacy-recovery",db=await context(uid),ref=doc(db,`trackers/${uid}`);
  await seed(`trackers/${uid}`,tracker({settings:{
    builtinSelectionVersion:1,healthNoticeVersion:1,healthNoticeAcceptedAt:"2026-08-25T00:00:00.000Z",
  }}));
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(ref,{updated:Date.now()}));
  await assertSucceeds(setDoc(ref,tracker()));
  const recovered=await assertSucceeds(getDoc(ref));
  const settings=recovered.data().settings;
  if("healthNoticeVersion" in settings||"healthNoticeAcceptedAt" in settings) throw new Error("legacy settings survived canonical replacement");
});

test("day, per-list, tombstone, and calorie-reference count boundaries match canonical client state", async () => {
  const db = await context("counts"),ref = doc(db, "trackers/counts");
  await assertSucceeds(setDoc(ref, tracker({ days: days(1095) })));
  await assertFails(setDoc(ref, tracker({ days: days(1096) })));
  await assertSucceeds(setDoc(ref, tracker({ days: { "client-validates-dynamic-key": {} } })));
  await assertSucceeds(setDoc(ref, tracker({ foods: { b: Array(200).fill(null) } })));
  await assertFails(setDoc(ref, tracker({ foods: { b: Array(201).fill(null) } })));
  await assertSucceeds(setDoc(ref, tracker({ foods: { b: Array(100).fill(null), s: Array(100).fill(null) } })));
  await assertSucceeds(setDoc(ref, tracker({ foods: { b: Array(101).fill(null), s: Array(100).fill(null) } })));
  await assertSucceeds(setDoc(ref, tracker({ calref: { items: Array(500).fill(null) } })));
  await assertFails(setDoc(ref, tracker({ calref: { items: Array(501).fill(null) } })));
  await assertFails(setDoc(ref, tracker({ foods: { unknown: [] } })));
  await assertFails(setDoc(ref, tracker({ calref: { unknown: [] } })));
});

test("combined client maxima can be created and updated without exhausting Rules expressions", async () => {
  const db=await context("combined-max"),ref=doc(db,"trackers/combined-max"),now=Date.now();
  const settings={
    name:"ن".repeat(40),sex:"f",age:100,ht:230,act:1.725,klo:1200,khi:6000,
    plo:40,phi:300,sw:30,gw:300,tw:0,_ts:now,targetFormulaVersion:1,builtinSelectionVersion:1,
    aiDisclosureVersion:1,aiDisclosureAcceptedAt:"2026-08-25T00:00:00.000Z",
  };
  const maximum=tracker({
    days:days(1095),settings,foods:{b:Array.from({length:200},(_,index)=>storedFood("أكلة "+index),),_ts:now},
    calref:{items:Array.from({length:500},(_,index)=>storedFood("مرجع "+index)),_ts:now},updated:now,
  });
  await assertSucceeds(setDoc(ref,maximum));
  await assertSucceeds(updateDoc(ref,{updated:Date.now()}));
});

test("the same validator prevents update bypass on valid and admin-seeded invalid roots", async () => {
  const db = await context("update-bypass"),ref = doc(db, "trackers/update-bypass");
  await assertSucceeds(setDoc(ref, tracker()));
  await assertFails(updateDoc(ref, { settings: { name: "x".repeat(1000) }, updated: Date.now() }));
  await assertFails(updateDoc(ref, { unknown: true, updated: Date.now() }));
  await seed("trackers/update-bypass", { days: {} });
  await assertFails(updateDoc(ref, { updated: Date.now() }));
});

test("membership is own-get-only and client writes or listing are denied", async () => {
  const db = await context("member-doc"),other = env.authenticatedContext("other-user").firestore();
  await assertSucceeds(getDoc(doc(db, "betaMembers/member-doc")));
  await assertFails(getDoc(doc(db, "betaMembers/someone-else")));
  await assertFails(getDocs(collection(db, "betaMembers")));
  await assertFails(setDoc(doc(db, "betaMembers/member-doc"), { enabled: true }));
  await assertFails(updateDoc(doc(db, "betaMembers/member-doc"), { enabled: false }));
  await assertFails(deleteDoc(doc(db, "betaMembers/member-doc")));
  await assertFails(setDoc(doc(other, "betaMembers/other-user"), { enabled: true }));
});

test("tracker subcollections, tracker listing, and unknown collections are explicitly denied", async () => {
  const db = await context("path-deny");
  await assertFails(setDoc(doc(db, "trackers/path-deny/private/item"), { value: 1 }));
  await assertFails(getDoc(doc(db, "trackers/path-deny/private/item")));
  await assertFails(getDocs(collection(db, "trackers")));
  await assertFails(getDoc(doc(db, "admins/path-deny")));
  await assertFails(setDoc(doc(db, "admins/path-deny"), { admin: true }));
});
