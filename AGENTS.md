# Repository Guidelines

## Project Structure & Module Organization

This is a dependency-free, build-step-free Firebase application. `public/index.html` holds the Arabic RTL markup, the styles, and the Firebase AI module block; the app logic lives in five plain classic scripts it loads in order — `data.js`, `calc.js`, `state.js`, `render.js`, `sync.js`. They share one global scope, so a binding declared in any of them resolves in the ones after it. Keep the existing section comments and put new code in the file that matches its concern: `calc.js` stays free of state access and of the nutrition tables — the unit suite loads it in isolation, so reaching for `S` or `MEALS` from it fails the tests — and `sync.js` stays last because it ends with `initSync()`.

`firebase.json` defines Firestore rules and two Hosting targets (`main` and `nice`), while `.firebaserc` maps those targets to the shared Firebase project. Authorization for each user's document lives in `firestore.rules`. Generated Firebase cache data under `.firebase/` must remain untracked.

### Architecture Invariants

- The five application files are classic scripts, not modules. Their load order is their dependency order and preserves the inline `onclick=` handlers without `window` shims.
- `tests/unit/profile.test.mjs` both runs `calc.js` in isolation and checks its source for forbidden state/data identifiers. A free identifier inside an uncalled function still parses, so passing a syntax/load check alone does not prove `calc.js` is isolated.
- `S` is mirrored to `localStorage["diet_tracker_v1_" + uid]`; `save()` schedules a debounced Firestore write to `/trackers/{uid}`, and `mergeRemote()` applies remote snapshots.
- Auth and sync lazily load the Firebase compat SDK v10.14.1. The single inline module loads the modular SDK v12.9.0 into a second named app, `"ai"`, for `aiEstimate()` and App Check. Keep that separation and the validator's one-inline-module invariant.
- Keep the AI model on the Lite tier (`gemini-flash-lite-latest`) unless a measured change justifies moving it. The broad `gemini-flash-latest` alias previously caused a 4–5 second latency regression; re-run calorie-reference spot checks whenever the model changes.
- Native `<datalist>` suggestions deliberately survive wholesale `innerHTML` re-renders and remote merges. Calorie-reference suggestions split stored `"النوع (الكمية)"` titles between `crNames()` and `qtyNames()` so the quantity is not duplicated in AI prompts.

### Nutrition and Target Invariants

- `calcTargets()` uses Mifflin-St Jeor BMR times activity. Cutting subtracts `min(1100, max(300, 8.25 * kg))` — a bodyweight-anchored ~0.75%/week rate, not a fraction of TDEE, because activity raises TDEE without raising fat reserves; bulking adds 300 kcal.
- The result is floored at `max(1250, ceil(BMR/50)*50)`, so the app can never prescribe intake below resting metabolism. `ceil` is deliberate: rounding to nearest could land below BMR. The floor binds on sedentary cuts, where 0.75%/week is unreachable above BMR — those users correctly get a smaller deficit. `rateBand()` derives the 0.5–1.0%/week acceptance window the UI copy shows from the same rule; it must stay consistent with the deficit.
- Protein is capped at the 300 g ceiling enforced by `validTargets()`. Calories are deliberately not clamped: out-of-band results must be rejected instead of distorted.
- The reviewed-profile expected values (`tdee 3220`, `klo 2300`, `khi 2400`, `plo 172`, `phi 189`) live in both the `calc.js` assertion IIFE and `tests/unit/profile.test.mjs`. Update both when formulas change, and bump `REVIEWED_PROFILE_VERSION` so `migrateReviewedProfile()` refreshes the fingerprinted stored profile.
- The `tw` setting is the weight at which targets were last reviewed; it is written by setup, by `migrateReviewedProfile()`, by 🔄 احسب تلقائي, and by dismissing the stale-target note. `renderProg()` prompts only when `targetsMoved()` — a full 50 kcal rounding step, the smallest real change — separates `calcTargets()` at `basisWeight()` from `calcTargets()` at `tw`. Comparing suggestion to suggestion rather than to the stored target is what keeps hand-typed targets from ever being flagged. Both the prompt and the button read `basisWeight()`, the 14-day mean, so day-to-day water weight cannot move either.
- `sw` is the progress baseline for both the milestone ladder and "التغيير من البداية"; it is the declared start weight, not the first logged weigh-in, so the two cards cannot disagree.
- Every `MEALS`, `EXTRAS`, and `CALREF` entry must satisfy `|k - (p*4 + f*9 + c*4)| / k <= 10%`. Both `data.js` and `scripts/validate.mjs` enforce this, and `macroMismatch()` surfaces it in the UI.

## Development and Deployment Commands

The app has no runtime build step. Contributor checks use one development dependency:

- `npm install` installs the development-only formatting tool and configures tracked Git hooks.
- `npm run check` runs formatting checks, JavaScript/data validation, and reviewed-profile assertions.
- `npm run format` formats Markdown and JSON files; `public/index.html` and the five `public/*.js` files intentionally retain their compact style.
- `firebase emulators:start --only hosting,firestore` serves the app and evaluates Firestore behavior locally.
- `firebase deploy --only hosting:main` deploys `public/` to the primary site.
- `firebase deploy --only hosting:nice` deploys the alternate site.
- `firebase deploy --only firestore:rules` publishes security-rule changes.

Run a focused unit test with `node --test --test-name-pattern="<name>" tests/unit/<file>.test.mjs`. Run a focused browser test against an already-running emulator with `npx playwright test --project=desktop -g "<name>"`.

Run deployment commands only from the repository root and verify the active project with `firebase use`.

The two Hosting targets serve the same `public/` directory. Keep the `no-store` header for both `**/*.html` and `**/*.js`: otherwise returning users can receive fresh HTML with stale JavaScript. Firebase's catch-all rewrite can return missing JavaScript as HTTP 200 HTML, so release verification must byte-compare every live file against the tagged `public/`, not only `index.html`. Releases are driven by annotated `v*` tags and deploy both targets.

## Coding Style & Naming Conventions

Follow the existing two-space indentation in JavaScript and Firebase JSON. Keep HTML and CSS compact, use double quotes in markup and JavaScript strings, and retain `"use strict"`. Existing JavaScript uses `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants such as `MEALS`, and short kebab-case DOM IDs such as `tab-day`. Keep user-facing copy in Egyptian Arabic and preserve `lang="ar"` and `dir="rtl"`.

Prettier formats Markdown and JSON. `scripts/validate.mjs` checks that every referenced script exists and parses, plus the nutrition data and Firebase JSON. Avoid unrelated reformatting of the app files.

## Testing Guidelines

`npm run check` is the gate the pre-commit hook runs: formatting, `scripts/validate.mjs`, `node --test tests/unit/*.test.mjs`, and emulator-backed Firestore rules tests. `npm run check:static` drops the rules tests when Java 21 is unavailable. Playwright specs run separately inside the emulator: `npx firebase-tools emulators:exec --only auth,firestore,hosting "npm run test:browser"`. Their `afterEach` asserts zero console errors, so any stray `console.error` or failed request fails every spec.

Beyond the suites, exercise login/logout, profile setup, daily entry persistence, tab navigation, import/export, and mobile layouts before submitting.

`TEST_MODE` is active only on localhost or `127.0.0.1` with `?test=1`. It connects Auth and Firestore emulators, signs in anonymously, and skips App Check; production hosts ignore the flag. Keep `window.__dietTest` exports in `sync.js` aligned with browser-test needs.

## Health-Content Changes

Treat calorie, macro, projection, and recommendation changes as evidence-sensitive:

- The projection to 86 kg is roughly 20 weeks from 99.6 kg and assumes targets are recalculated as weight falls. Because the deficit is now proportional to weight, recalculating gives exponential decay at 0.75%/week rather than a fixed rate, so the estimate stretches as weight drops.
- Protein at 2.0–2.2 g/kg of goal weight is an intentional adaptation, not the 2.2–3.0 g/kg recommendation in PMID 34579132.
- The 221–251 g carbohydrate range is 38.4–43.7% of 2,300 kcal, below the 45–65% AMDR band as a tradeoff of the protein-forward deficit. The rate-anchored deficit widened this gap; fat and carbohydrate remain interchangeable within the calorie ceiling.
- `project()` and the rate copy use the linear 7,700 kcal/kg approximation, which ignores adaptive thermogenesis and must not be presented as a measurement.

Check primary sources such as USDA FoodData Central, ISSN, FDA, NIH ODS, CDC, and IOM DRI before changing nutrition data or recommendation logic.

## Commit & Pull Request Guidelines

Use Conventional Commits, enforced by the tracked `commit-msg` hook: `type(scope): imperative summary`. Example: `fix(nutrition): correct daily protein target`. Keep commits focused. Update `CHANGELOG.md` under `Unreleased` for user-visible changes, following Keep a Changelog categories. Pull requests should explain behavior changes, list manual checks, link relevant issues, and include before/after screenshots for UI changes. Highlight Firebase configuration or security-rule changes explicitly.

## Release-Driven Workflow

All production changes follow this cycle:

1. **Branch:** Start from an up-to-date `main` (`git pull --ff-only origin main`) and create a focused `feature/<short-name>` or `fix/<short-name>` branch. Do not develop or commit directly on `main`.
2. **Pull request:** Push the branch and open a PR into `main`. Keep the PR limited to one feature or fix, update `CHANGELOG.md` under `Unreleased`, and include the required explanation, checks, issue links, and UI evidence.
3. **Review:** Wait for required reviews and for the quality workflow, browser suite, and preview deployment to pass. Address feedback on the same branch and repeat validation before merge.
4. **Upgrade `main`:** Merge only the approved PR, then update the local `main` with `git pull --ff-only origin main`. Confirm that the merged commit and all intended release changes are present on `main`; never release from a topic branch.
5. **Release:** Choose the next Semantic Version, finalize the changelog and all visible/package version references through a reviewed PR when needed, and ensure `main` is green. Create an annotated `vX.Y.Z` tag on the release commit (`git tag -a vX.Y.Z -m "vX.Y.Z"`) and push that tag. The tag-triggered release workflow runs the full checks, deploys both Hosting targets, and verifies every deployed file. Do not use a manual Firebase production deploy as a substitute for this workflow.

If a release fails, fix it through a new `fix/*` branch and reviewed PR, update `main`, and publish a new SemVer tag. Do not move or reuse a published release tag.

## Security & Configuration

Never commit service-account keys, `.env` files, exported user data, or debug logs. Deployments authenticate with short-lived GitHub OIDC credentials rather than stored service-account keys. Treat changes to `firestore.rules`, Firebase project mappings, authentication, and import handling as security-sensitive.
