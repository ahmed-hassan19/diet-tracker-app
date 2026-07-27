import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import test, { after, before } from "node:test";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "diet-tracker-372ca",
    firestore: {
      rules: await readFile("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

after(async () => {
  await env.cleanup();
});

test("owner can create, read, update, and delete their tracker", async () => {
  const db = env.authenticatedContext("owner").firestore();
  const ref = doc(db, "trackers/owner");
  await assertSucceeds(setDoc(ref, { days: {} }));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, { days: { today: {} } }));
  await assertSucceeds(deleteDoc(ref));
});

test("another user cannot read or write the owner's tracker", async () => {
  const db = env.authenticatedContext("intruder").firestore();
  await assertFails(getDoc(doc(db, "trackers/owner")));
  await assertFails(setDoc(doc(db, "trackers/owner"), { days: {} }));
});

test("unauthenticated access is denied", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "trackers/owner")));
  await assertFails(setDoc(doc(db, "trackers/owner"), { days: {} }));
});

test("unknown collections are denied", async () => {
  const db = env.authenticatedContext("owner").firestore();
  await assertFails(getDoc(doc(db, "admins/owner")));
  await assertFails(setDoc(doc(db, "admins/owner"), { admin: true }));
});
