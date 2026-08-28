# Diet Tracker

Private, proprietary Arabic RTL single-page diet tracker. It records meals,
macros, hydration, exercise, sleep, weight, and notes, then synchronizes one
document per authenticated user with Firebase.

## Architecture

- `public/index.html`: markup, styles, and the single modular Firebase bridge.
- `public/data.js`: meal, extra, and calorie-reference nutrition tables.
- `public/evidence.html`: public Arabic evidence and calculation-limits page.
- `public/nutrition-sources.json`: machine-readable 75-entry nutrition-source ledger.
- `public/calc.js`: pure calorie/protein/macro functions — no state access.
- `public/state.js`: state normalization, IndexedDB persistence, import/export,
  and the accessors that read state (`T`, `totals`, `project`).
- `public/render.js`: tab renderers and UI handlers.
- `public/sync.js`: classic-script Auth/Firestore sync through the narrow bridge
  and the `initSync()` entry point. Loads last.
- `firestore.rules`: owner-only access to `/trackers/{uid}`.
- `firebase.json`: fixed Auth, Firestore, and Hosting emulator ports plus the
  `main` and `nice` production Hosting targets.
- `scripts/validate.mjs`: script-tag, nutrition, and configuration assertions.
- `runtime-resources.json`: exact URL, byte length, and SHA-256 pins for the five
  Firebase browser SDK resources.
- `scripts/csp.mjs`: derives and validates the inline-module and static-handler
  CSP hashes shared by both Hosting targets.
- `scripts/version-contract.mjs`: shared package, runtime, changelog, and release-tag version check.
- `scripts/generate-icons.mjs`: deterministic hosted-install icon generator and byte checker.
- `tests/`: unit, emulator-backed rules, and Playwright browser coverage.

Data model:

```text
/trackers/{authenticated uid}
  days      date-keyed meals, water, exercise, weight, sleep, and notes
  settings  profile and calorie/protein targets
  foods     user-created meal and extra options
  calref    user-created calorie-reference entries
  updated   client timestamp
```

The same canonical state is cached in IndexedDB database `diet_tracker`, store
`states`, keyed by authenticated UID. An older `diet_tracker_v1_{uid}`
localStorage value is removed only after it has normalized, migrated, been read
back, and matched byte-for-byte. The remaining localStorage marker contains no
user data. Valid paired legacy notice fields are accepted only at the
normalization boundary and omitted from live state, IndexedDB, Firestore writes,
and exports.

The nutrition ledger binds every current item to exact FNDDS record IDs or an
exact manufacturer label and publishes the gram-scaled recipe calculation.
The Egyptian food-table catalog is retained as a local-food identity and
preparation cross-check. Only the three legacy-only saved options keep their
historical macros; all 72 current entries use the reviewed values.

Every local mutation, import, test assignment, and remote snapshot passes the
same current-schema boundary before it can replace live state. Imports are
limited to 10 MiB raw and 600 KiB canonical cloud shape; a warning begins at
500 KiB. The boundary also caps day, custom-food, calorie-reference, note, and
field sizes. Invalid cloud documents are quarantined so they cannot render or
be overwritten, while raw recovery export and delete remain available.

## Setup

Requirements: Node.js 22, Java for the Firestore emulator, Firebase CLI access,
and a browser supported by Playwright.

```sh
npm install
npx playwright install chromium
npx firebase-tools use
npx firebase-tools emulators:start --only auth,firestore,hosting
```

Open <http://127.0.0.1:5005/?test=1>. The localhost-only test mode connects to
the emulators and signs in anonymously. Production and preview hosts ignore the
flag and continue to use Google authentication.

## Checks

```sh
npm run check
npx firebase-tools emulators:exec --only auth,firestore,hosting "npm run test:browser"
```

Manually verify login/logout, profile setup, IndexedDB persistence and legacy
migration, every available tab, import rollback/export, malformed-cloud
recovery, delete-all, mobile layouts, and a clean browser console.

## Install on iPhone

Open the primary host, <https://diet-tracker-372ca.web.app>, in the current
Safari. Choose Share, then Add to Home Screen, enable Open as Web App, and
choose Add. This follows [Apple's current installation flow](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).
WebKit [confirms that an iOS Home Screen web app does not require a service
worker](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
This app intentionally has no service worker and does not support an
offline-first launch; an internet connection is required. HTML and JavaScript
keep their production `no-store` headers. Both hosts also ship the same strict
CSP, frame denial, referrer, permissions, and MIME-sniffing headers.

## Deployment

Production deploys are owner-run with human Firebase OAuth; GitHub holds no
Google credential. Follow [docs/releasing.md](docs/releasing.md) from an exact
annotated release tag:

```sh
npx firebase-tools use
node scripts/release-deploy.mjs vX.Y.Z
```

The script requires successful validation for the exact tag, exact agreement
between the package, lockfile, runtime version, tag, and changelog, and a current local
record of Spark/no-billing status, quota usage, exact AI model, and
P4SA/API-key posture. It derives the AI rollout stage from the tagged client:
disabled releases record the current preconfiguration or hardened baseline and
exact targets, while enabled releases additionally require the completed Auth,
paired valid/invalid App Check rejection, all-location quota, logging, and model
spot-check evidence. It verifies
tagged Rules, indexes, runtime-resource manifest, complete Hosting header
configuration, every pinned Firebase SDK response, and every deployed file
before printing the GitHub Release publication command. Do not create or upload
service-account keys.

## Privacy and security

See [public/privacy.html](public/privacy.html) for data handling and deletion.
See [public/evidence.html](public/evidence.html) for the calculation source notes
and [public/nutrition-sources.json](public/nutrition-sources.json) for the exact
runtime nutrition inventory and source ledger.
Never commit service-account keys, debug tokens, completed release records, or
console captures. The one modular Firebase app uses invisible reCAPTCHA v3 for
App Check. v3.14.0 adds reCAPTCHA's required connection source, narrowly
delegates Storage Access to the two Google reCAPTCHA origins, and restores AI
estimation for enabled beta members. It deliberately uses the moving
`gemini-flash-lite-latest` alias, whose target can change without an app release;
Spark/no-billing and manual entry remain the failure boundary. The hardened
controls and fresh membership check stay in place, and manual macro entry
remains available to invited, pending, revoked, and uninvited users.

Previously published material may remain in older commits, tags, downloaded
archives, clones, and intermediary caches even after it is removed from the
current tree.
