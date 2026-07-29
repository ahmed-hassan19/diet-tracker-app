# Repository Guidelines

## Project Structure & Module Organization

This is a dependency-free, build-step-free Firebase application. `public/index.html` holds the Arabic RTL markup, the styles, and the Firebase AI module block; the app logic lives in five plain classic scripts it loads in order — `data.js`, `calc.js`, `state.js`, `render.js`, `sync.js`. They share one global scope, so a binding declared in any of them resolves in the ones after it. Keep the existing section comments and put new code in the file that matches its concern: `calc.js` stays free of state access and of the nutrition tables — the unit suite loads it in isolation, so reaching for `S` or `MEALS` from it fails the tests — and `sync.js` stays last because it ends with `initSync()`.

`firebase.json` defines Firestore rules and two Hosting targets (`main` and `nice`), while `.firebaserc` maps those targets to the shared Firebase project. Authorization for each user's document lives in `firestore.rules`. Generated Firebase cache data under `.firebase/` must remain untracked.

## Development and Deployment Commands

The app has no runtime build step. Contributor checks use one development dependency:

- `npm install` installs the development-only formatting tool and configures tracked Git hooks.
- `npm run check` runs formatting checks, JavaScript/data validation, and reviewed-profile assertions.
- `npm run format` formats Markdown and JSON files; `public/index.html` and the five `public/*.js` files intentionally retain their compact style.
- `firebase emulators:start --only hosting,firestore` serves the app and evaluates Firestore behavior locally.
- `firebase deploy --only hosting:main` deploys `public/` to the primary site.
- `firebase deploy --only hosting:nice` deploys the alternate site.
- `firebase deploy --only firestore:rules` publishes security-rule changes.

Run deployment commands only from the repository root and verify the active project with `firebase use`.

## Coding Style & Naming Conventions

Follow the existing two-space indentation in JavaScript and Firebase JSON. Keep HTML and CSS compact, use double quotes in markup and JavaScript strings, and retain `"use strict"`. Existing JavaScript uses `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants such as `MEALS`, and short kebab-case DOM IDs such as `tab-day`. Keep user-facing copy in Egyptian Arabic and preserve `lang="ar"` and `dir="rtl"`.

Prettier formats Markdown and JSON. `scripts/validate.mjs` checks that every referenced script exists and parses, plus the nutrition data and Firebase JSON. Avoid unrelated reformatting of the app files.

## Testing Guidelines

`npm run check` is the gate the pre-commit hook runs: formatting, `scripts/validate.mjs`, `node --test tests/unit/*.test.mjs`, and emulator-backed Firestore rules tests. `npm run check:static` drops the rules tests when Java 21 is unavailable. Playwright specs run separately inside the emulator: `npx firebase-tools emulators:exec --only auth,firestore,hosting "npm run test:browser"`. Their `afterEach` asserts zero console errors, so any stray `console.error` or failed request fails every spec.

Beyond the suites, exercise login/logout, profile setup, daily entry persistence, tab navigation, import/export, and mobile layouts before submitting.

## Commit & Pull Request Guidelines

Use Conventional Commits, enforced by the tracked `commit-msg` hook: `type(scope): imperative summary`. Example: `fix(nutrition): correct daily protein target`. Keep commits focused. Update `CHANGELOG.md` under `Unreleased` for user-visible changes, following Keep a Changelog categories. Pull requests should explain behavior changes, list manual checks, link relevant issues, and include before/after screenshots for UI changes. Highlight Firebase configuration or security-rule changes explicitly.

## Security & Configuration

Never commit service-account keys, `.env` files, exported user data, or debug logs. Treat changes to `firestore.rules`, Firebase project mappings, authentication, and import handling as security-sensitive.
