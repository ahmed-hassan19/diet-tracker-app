# Diet Tracker

Private, proprietary Arabic RTL single-page diet tracker. It records meals,
macros, hydration, exercise, sleep, weight, and notes, then synchronizes one
document per authenticated user with Firebase.

> This is a general tracking tool, not medical advice, diagnosis, or treatment.
> Nutrition and AI estimates are approximate. Consult a qualified clinician for
> health decisions.

## Architecture

- `public/index.html`: markup, styles, and the Firebase AI module block.
- `public/data.js`: meal, extra, and calorie-reference nutrition tables.
- `public/calc.js`: pure calorie/protein/macro functions — no state access.
- `public/state.js`: the `S` state object, localStorage, import/export, and the
  accessors that read state (`T`, `totals`, `project`).
- `public/render.js`: all four tab renderers and the UI handlers.
- `public/sync.js`: Firebase Auth/Firestore integration, App Check bootstrap,
  and the `initSync()` entry point. Loads last.
- `firestore.rules`: owner-only access to `/trackers/{uid}`.
- `firebase.json`: fixed Auth, Firestore, and Hosting emulator ports plus the
  `main` and `nice` production Hosting targets.
- `scripts/validate.mjs`: script-tag, nutrition, and configuration assertions.
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

The same state is cached under `diet_tracker_v1_{uid}` in localStorage.

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

Manually verify login/logout, profile setup, daily persistence, every tab,
import/export, delete-all, mobile layouts, and a clean browser console.

## Screenshots

| Desktop                                                | Mobile                                               |
| ------------------------------------------------------ | ---------------------------------------------------- |
| ![Desktop emulator view](docs/screenshots/desktop.png) | ![Mobile emulator view](docs/screenshots/mobile.png) |

The screenshots use synthetic emulator data only.

## Deployment

Production deploys are owner-run with human Firebase OAuth; GitHub holds no
Google credential. Confirm the active project, then from the exact annotated
tag:

```sh
npx firebase-tools use
node scripts/release-deploy.mjs vX.Y.Z
```

The script verifies tag provenance and pinned tooling, deploys Rules/indexes
first, verifies the active Rules source against the tagged file, deploys both
production targets, byte-compares every live file, and writes a token-free
evidence manifest. Publishing the GitHub Release is then a hand-triggered
credential-free workflow (`gh workflow run release.yml -f …`) that re-verifies
provenance and every public live byte on both hosts. Annotated `v*` tags also
rerun all checks in GitHub Actions and record tagged bundle checksums. Do not
create or upload service-account keys.

## Privacy and security

See [public/privacy.html](public/privacy.html) for data handling and deletion.
Never commit service-account keys. App Check uses
invisible reCAPTCHA v3 in monitoring mode. Do not enforce it until legitimate
production and preview traffic has been measured.
