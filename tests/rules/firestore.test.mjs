import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
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
  // Membership docs are owner-provisioned in production; clients cannot write
  // them, so the fixtures are seeded with the security rules disabled.
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await setDoc(doc(db, "betaMembers/member"), { enabled: true });
    await setDoc(doc(db, "betaMembers/revoked"), { enabled: false });
    await setDoc(doc(db, "trackers/owner"), { days: {} });
    await setDoc(doc(db, "trackers/revoked"), { days: {} });
    await setDoc(doc(db, "trackers/lonely"), { days: {} });
  });
});

after(async () => {
  await env.cleanup();
});

test("enabled member can create, read, update, and delete their tracker", async () => {
  const db = env.authenticatedContext("member").firestore();
  const ref = doc(db, "trackers/member");
  await assertSucceeds(setDoc(ref, { days: {} }));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, { days: { today: {} } }));
  await assertSucceeds(deleteDoc(ref));
});

test("revoked member cannot create or update but can read and delete their own tracker", async () => {
  const db = env.authenticatedContext("revoked").firestore();
  const ref = doc(db, "trackers/revoked");
  await assertSucceeds(getDoc(ref));
  await assertFails(setDoc(ref, { days: {} }));
  await assertFails(updateDoc(ref, { updated: 1 }));
  await assertSucceeds(deleteDoc(ref));
});

test("non-member cannot create or update but can read and delete their own tracker", async () => {
  const db = env.authenticatedContext("lonely").firestore();
  const ref = doc(db, "trackers/lonely");
  await assertSucceeds(getDoc(ref));
  await assertFails(setDoc(ref, { days: {} }));
  await assertFails(setDoc(ref, { days: {} }, { merge: true }));
  await assertSucceeds(deleteDoc(ref));
});

for (const persona of ["member", "revoked", "intruder"]) {
  test(`cross-user ${persona} access to another user's tracker is denied`, async () => {
    const db = env.authenticatedContext(persona).firestore();
    const ref = doc(db, "trackers/owner");
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { days: {} }));
    await assertFails(deleteDoc(ref));
  });
}

test("unauthenticated access is denied", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "trackers/owner")));
  await assertFails(setDoc(doc(db, "trackers/owner"), { days: {} }));
  await assertFails(getDoc(doc(db, "betaMembers/member")));
});

test("membership listing is denied for every client", async () => {
  for (const ctx of [
    env.authenticatedContext("member"),
    env.authenticatedContext("intruder"),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDocs(collection(ctx.firestore(), "betaMembers")));
  }
});

test("clients cannot write any membership doc, including their own", async () => {
  const member = env.authenticatedContext("member").firestore();
  const intruder = env.authenticatedContext("intruder").firestore();
  await assertFails(setDoc(doc(member, "betaMembers/member"), { enabled: true }));
  await assertFails(updateDoc(doc(member, "betaMembers/member"), { enabled: false }));
  await assertFails(deleteDoc(doc(member, "betaMembers/member")));
  await assertFails(setDoc(doc(intruder, "betaMembers/intruder"), { enabled: true }));
});

test("a user can get only their own membership doc", async () => {
  const member = env.authenticatedContext("member").firestore();
  const lonely = env.authenticatedContext("lonely").firestore();
  await assertSucceeds(getDoc(doc(member, "betaMembers/member")));
  await assertFails(getDoc(doc(member, "betaMembers/revoked")));
  // doc-absent still resolves for the owner's own uid — treated as not invited.
  await assertSucceeds(getDoc(doc(lonely, "betaMembers/lonely")));
});

test("unknown collections are denied", async () => {
  const db = env.authenticatedContext("member").firestore();
  await assertFails(getDoc(doc(db, "admins/member")));
  await assertFails(setDoc(doc(db, "admins/member"), { admin: true }));
});
