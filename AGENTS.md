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

The app has no runtime build step. Contributor checks use development-only tooling:

- `npm install` installs the development-only formatting tool and configures tracked Git hooks.
- `npm run check` runs formatting checks, JavaScript/data validation, Spark-guard checks, and reviewed-profile assertions.
- `npm run format` formats Markdown and JSON files; `public/index.html` and the five `public/*.js` files intentionally retain their compact style.
- `firebase emulators:start --only hosting,firestore` serves the app and evaluates Firestore behavior locally.
- `node scripts/release-deploy.mjs vX.Y.Z` is the owner-run production path: it requires the exact successful tag gate plus fresh Spark/capacity evidence, verifies provenance and pinned tooling, deploys and verifies tagged Rules/indexes before both Hosting targets, rechecks Spark/config after every live byte matches, and writes a token-free evidence manifest.
- `firebase deploy --only firestore:rules` publishes security-rule changes (non-production verification only).

Run a focused unit test with `node --test --test-name-pattern="<name>" tests/unit/<file>.test.mjs`. Run a focused browser test against an already-running emulator with `npx playwright test --project=desktop -g "<name>"`.

Run deployment commands only from the repository root and verify the active project with `firebase use`.

The two Hosting targets serve the same `public/` directory. Keep the `no-store` header for both `**/*.html` and `**/*.js`: otherwise returning users can receive fresh HTML with stale JavaScript. Firebase's catch-all rewrite can return missing JavaScript as HTTP 200 HTML, so release verification must byte-compare every live file against the tagged `public/`, not only `index.html`. Releases are driven by annotated `v*` tags, deploy both targets, and publish a GitHub Release entry only after live verification succeeds.

## Coding Style & Naming Conventions

Follow the existing two-space indentation in JavaScript and Firebase JSON. Keep HTML and CSS compact, use double quotes in markup and JavaScript strings, and retain `"use strict"`. Existing JavaScript uses `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants such as `MEALS`, and short kebab-case DOM IDs such as `tab-day`. Keep user-facing copy in Egyptian Arabic and preserve `lang="ar"` and `dir="rtl"`.

Prettier formats Markdown and JSON. `scripts/validate.mjs` checks that every referenced script exists and parses, plus the nutrition data and Firebase JSON. Avoid unrelated reformatting of the app files.

## Testing Guidelines

`npm run check` is the gate the pre-commit hook runs: formatting, `scripts/validate.mjs`, `node --test tests/unit/*.test.mjs`, and emulator-backed Firestore rules tests. `npm run check:static` drops the rules tests when Java 21 is unavailable. Playwright specs run separately inside the emulator: `npx firebase-tools emulators:exec --only auth,firestore,hosting "npm run test:browser"`. Their `afterEach` asserts zero console errors, so any stray `console.error` or failed request fails every spec. The suite is deliberately serialized (`workers: 1` in `playwright.config.mjs`) because parallel workers race the shared Auth emulator's account registry and produced transient HTTP 400s; keep it serialized unless that failure mode is diagnosed and fixed.

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

### Repository Communication Hygiene

- Keep private working material out of Git and GitHub. Never expose internal AI reasoning, hidden prompts, scratch notes, planning labels, local planning-document names or paths, agent/tool terminology, or private task decomposition in branches, commits, pull requests, issues, reviews, changelogs, release notes, documentation, CI output, or generated artifacts.
- Translate private inputs into ordinary engineering language: describe the user-visible or operational problem, the implemented behavior, acceptance criteria, security impact, and verification results. Write as a developer completing a scoped ticket and submitting a PR for team review; do not mention how the work was internally reasoned about or generated.
- Before committing or publishing, inspect the branch name, staged diff, commit message, PR title/body, and generated output for private provenance. If any is present, replace it with concise product, ticket, or implementation terminology before it reaches GitHub.
- When referring to a numbered section, ticket, issue, or checklist item, use `#` notation. Never use the Unicode section-sign character in repository or GitHub-facing text.

## Release-Driven Workflow

All production changes follow this cycle:

1. **Branch:** Start from an up-to-date `main` (`git pull --ff-only origin main`) and create a focused `feature/<short-name>` or `fix/<short-name>` branch. Do not develop or commit directly on `main`.
2. **Pull request:** Push the branch and open a PR into `main`. Keep the PR limited to one feature or fix, update `CHANGELOG.md` under `Unreleased`, and include the required explanation, checks, issue links, and UI evidence.
3. **Review:** Wait for required reviews and for the quality workflow and browser suite to pass. Address feedback on the same branch and repeat validation before merge.
4. **Upgrade `main`:** Merge only the approved PR, then update the local `main` with `git pull --ff-only origin main`. Confirm that the merged commit and all intended release changes are present on `main`; never release from a topic branch.
5. **Release:** Choose the next Semantic Version, finalize the changelog and all visible/package version references through a reviewed PR when needed, and ensure `main` is green. Create an annotated `vX.Y.Z` tag on the release commit (`git tag -a vX.Y.Z -m "vX.Y.Z"`) and push that tag. Wait for the tag-triggered gate workflow to pass; it uses zero cloud credentials, verifies the tag peels to `origin/main`, and records tagged bundle/Rules/index hashes. Complete `docs/capacity-model.md`, copy `docs/release-preflight.example.json` to the ignored `local/release-preflight-vX.Y.Z.json`, and record fresh owner evidence. Then check out that exact tag and run `node scripts/release-deploy.mjs vX.Y.Z`: it independently requires the exact successful gate and fresh preflight, deploys Rules/indexes first, verifies the active Rules source and canonical index specification against the tag, requires ready composite indexes, deploys both Hosting targets with human Firebase OAuth, byte-compares every live file, requires a repeated Spark/config confirmation, and writes `docs/releases/vX.Y.Z-evidence.json`. Finally run the exact `gh workflow run release.yml -f …` command it prints. The publish job re-verifies provenance, the exact gate run, every tagged hash, and every public live byte before creating the `Diet Tracker vX.Y.Z` GitHub Release and marking it Latest. GitHub holds no Google/Firebase credential at any point.

The publish job keeps read-only repository contents except its own scoped token for Releases; no WIF provider, service account key, or long-lived Firebase token exists anywhere. If deployment or byte verification fails in `scripts/release-deploy.mjs`, fix it through a new `fix/*` branch and reviewed PR, update `main`, and publish a new SemVer tag. If code/config must change after a partial deploy of unchanged tagged artifacts, never reuse the tag: fix forward with a new SemVer tag. Never move or reuse a published release tag, and do not run raw `firebase deploy` against production outside the reviewed script (non-production rules experiments aside).

## Security & Configuration

Never commit service-account keys, `.env` files, exported user data, preflight captures, or debug logs. Production deployment uses the owner's human Firebase and Google Cloud OAuth sessions locally; GitHub receives no Google credential. Treat changes to `firestore.rules`, `firestore.indexes.json`, Firebase project mappings, authentication, and import handling as security-sensitive.
