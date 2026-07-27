# Diet Tracker

Private, proprietary Arabic RTL single-page diet tracker. It records meals,
macros, hydration, exercise, sleep, weight, and notes, then synchronizes one
document per authenticated user with Firebase.

> This is a general tracking tool, not medical advice, diagnosis, or treatment.
> Nutrition and AI estimates are approximate. Consult a qualified clinician for
> health decisions.

## Architecture

- `public/index.html`: dependency-free UI, styles, state, nutrition data,
  Firebase Auth/Firestore integration, App Check bootstrap, and Firebase AI.
- `firestore.rules`: owner-only access to `/trackers/{uid}`.
- `firebase.json`: fixed Auth, Firestore, and Hosting emulator ports plus the
  `main` and `nice` production Hosting targets.
- `scripts/validate.mjs`: JavaScript, nutrition, configuration, and reviewed
  profile assertions.
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

Confirm the active project before deploying:

```sh
npx firebase-tools use
npx firebase-tools deploy --only hosting:main
npx firebase-tools deploy --only hosting:nice
npx firebase-tools deploy --only firestore:rules
```

Pull requests receive an expiring seven-day preview of `main` after `quality`
passes. Annotated `v*` tags rerun all checks, deploy both production targets,
and compare each live response byte-for-byte with the tagged
`public/index.html`. GitHub Actions uses Workload Identity Federation; do not
create or upload service-account keys.

## Privacy and security

See [PRIVACY.md](PRIVACY.md) for data handling and deletion, and
[SECURITY.md](SECURITY.md) for private vulnerability reporting. The App Check
client bootstrap is ready, but `APP_CHECK_SITE_KEY` must remain empty until the
reCAPTCHA v3 site and Firebase web app registration are completed. After
registration, run App Check in monitoring mode and do not enforce it until
legitimate production and preview traffic has been measured.
