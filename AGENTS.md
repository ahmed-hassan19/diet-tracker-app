# Repository Guidelines

## Project Structure & Module Organization

This is a dependency-free, single-page Firebase application. `public/index.html` contains the Arabic RTL interface, styles, application state, nutrition data, and client-side Firebase integration. Keep related HTML, CSS, and JavaScript sections grouped and preserve the existing section comments.

`firebase.json` defines Firestore rules and two Hosting targets (`main` and `nice`), while `.firebaserc` maps those targets to the shared Firebase project. Authorization for each user's document lives in `firestore.rules`. Generated Firebase cache data under `.firebase/` must remain untracked.

## Development and Deployment Commands

The app has no runtime build step. Contributor checks use one development dependency:

- `npm install` installs the development-only formatting tool and configures tracked Git hooks.
- `npm run check` runs formatting checks, JavaScript/data validation, and reviewed-profile assertions.
- `npm run format` formats Markdown and JSON files; `public/index.html` intentionally retains its compact style.
- `firebase emulators:start --only hosting,firestore` serves the app and evaluates Firestore behavior locally.
- `firebase deploy --only hosting:main` deploys `public/` to the primary site.
- `firebase deploy --only hosting:nice` deploys the alternate site.
- `firebase deploy --only firestore:rules` publishes security-rule changes.

Run deployment commands only from the repository root and verify the active project with `firebase use`.

## Coding Style & Naming Conventions

Follow the existing two-space indentation in JavaScript and Firebase JSON. Keep HTML and CSS compact, use double quotes in markup and JavaScript strings, and retain `"use strict"`. Existing JavaScript uses `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants such as `MEALS`, and short kebab-case DOM IDs such as `tab-day`. Keep user-facing copy in Egyptian Arabic and preserve `lang="ar"` and `dir="rtl"`.

Prettier formats Markdown and JSON. `scripts/validate.mjs` checks the inline JavaScript, nutrition data, Firebase JSON, and reviewed-profile targets. Avoid unrelated reformatting of the large single-file app.

## Testing Guidelines

No automated test framework or coverage target is configured. Before submitting changes, exercise login/logout, profile setup, daily entry persistence, tab navigation, import/export, and mobile layouts. For rule changes, confirm an authenticated user can access only `/trackers/{theirUid}` using the Firestore emulator. Check the browser console for runtime errors.

## Commit & Pull Request Guidelines

Use Conventional Commits, enforced by the tracked `commit-msg` hook: `type(scope): imperative summary`. Example: `fix(nutrition): correct daily protein target`. Keep commits focused. Update `CHANGELOG.md` under `Unreleased` for user-visible changes, following Keep a Changelog categories. Pull requests should explain behavior changes, list manual checks, link relevant issues, and include before/after screenshots for UI changes. Highlight Firebase configuration or security-rule changes explicitly.

## Security & Configuration

Never commit service-account keys, `.env` files, exported user data, or debug logs. Treat changes to `firestore.rules`, Firebase project mappings, authentication, and import handling as security-sensitive.
