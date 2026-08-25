# Repository Guidelines

## Project Structure & Module Organization

This is a dependency-free, build-step-free Firebase application. `public/index.html` holds the Arabic RTL markup, the styles, and the Firebase AI module block; the app logic lives in five plain classic scripts it loads in order — `data.js`, `calc.js`, `state.js`, `render.js`, `sync.js`. They share one global scope, so a binding declared in any of them resolves in the ones after it. Keep the existing section comments and put new code in the file that matches its concern: `calc.js` stays free of state access and of the nutrition tables — the unit suite loads it in isolation, so reaching for `S` or `MEALS` from it fails the tests — and `sync.js` stays last because it ends with `initSync()`.

`firebase.json` defines Firestore rules and two Hosting targets (`main` and `nice`), while `.firebaserc` maps those targets to the shared Firebase project. Authorization for each user's document lives in `firestore.rules`. Generated Firebase cache data under `.firebase/` must remain untracked.

### Architecture Invariants

- The five application files are classic scripts, not modules. Their load order is their dependency order and preserves the inline `onclick=` handlers without `window` shims.
- `tests/unit/profile.test.mjs` runs `calc.js` in isolation and checks its source for forbidden state/data identifiers. A free identifier inside an uncalled function still parses, so passing a syntax/load check alone does not prove `calc.js` is isolated.
- Canonical `S` is cached by UID in IndexedDB database `diet_tracker`, store `states`; writes are serialized so an older completion cannot replace newer state. A legacy `localStorage["diet_tracker_v1_" + uid]` value is deleted only after normalized IndexedDB write/readback byte agreement, leaving only the non-health-data migration marker. `schedulePush()` debounces whole-document Firestore writes to `/trackers/{uid}`, and `mergeRemote()` applies only normalized remote snapshots.
- `normalizeState(raw, source)` is the boundary for wholesale assignments, production mutations, imports, local cache reads, and remote snapshots. Successful values are cloned and deeply frozen. Imports reject raw files above 10 MiB or canonical cloud-shaped payloads above 600 KiB, warn at 500 KiB, and must complete a durable IndexedDB write/readback before changing live state or scheduling cloud work. Malformed remote state is quarantined and blocks writes while preserving generic raw export/delete recovery.
- The single inline module pins Firebase Web SDK v12.17.1 and initializes exactly one modular app for Auth, Firestore, App Check, and AI. It exposes only the promise-based `window.firebaseBridge` used by the five classic scripts; never add a compat stack, a named second app, SDK objects, or copied Auth/App Check tokens.
- Keep the AI model pinned to the reviewed stable Lite tier (`gemini-3.5-flash-lite`) through `GoogleAIBackend()`. Never select a runtime fallback. Re-run calorie-reference and latency spot checks and reconfirm billing-not-required status whenever the model changes.
- Release v3.7.0 ships the hardened AI path with `window.AI_ENABLED=false`. Both render.js call sites (`aiFill`, `aiCalRef`) check `aiOn()` before the bridge, hide the 🤖 buttons, retain complete manual entry, and make no AI or membership network call while disabled. The release validator derives this flag from the exact tagged `index.html`. Schema 4 disabled records explicitly select the observed preconfiguration state or the hardened-disabled state; the latter proves the configured Auth, App Check, all-location 6 RPM/user quota, logging, both-host, and spot-check posture while recording an invalid-App-Check `401` without claiming the required `403`. An enabled rollout still requires verified `403`. The static guard permits `true` only from v3.7.1 onward, so the later reviewed enablement does not require weakening it.
- The AI quota record pins the exact Generate Content per-project/per-user metric and quota ID, the current 38 named regions, and the grouped five-location bucket. Every listed bucket must be 100 in the disabled preconfiguration baseline and 6 in the hardened-disabled or enabled state. Treat any location-set change as release-blocking until the inventory and validator are reviewed together; the similarly named Bidi metric never satisfies this gate.
- Schema 5 hardened-disabled and enabled release evidence mirrors the current Cloud Logging `LogExclusion` resource: the exact filter, `disabled == false`, and canonical `createTime`/`updateTime`, plus a canonical verification time no more than 24 hours old. It requires `created <= updated <= verified` and sets the conservative existing-log expiry to exactly `updateTime` plus the `_Default` 30-day retention; that historical deadline may pass. Preconfiguration records keep all exclusion-resource timestamps and the expiry null. Missing, future, noncanonical, inconsistent, or stale verification evidence fails closed. Already-published tags retain their tagged schema-4 validator behavior.
- Every enabled AI request requires the current same-app Auth user and a new server-source `/betaMembers/{uid}` read immediately before model generation. Missing, disabled, offline, stale-session, or denied membership fails closed. This client check is not server-enforced invite-only AI; App Check, authenticated-users mode, quotas, and Spark limit abuse but do not remove multi-account availability risk.
- `normalizeAiEstimate()` accepts exactly numeric `k/p/f/c`, rounds whole values only after finite bounds checks (`k` 1–5000, `p/c` 0–1250, `f` 0–556), and enforces the 10% macro-energy invariant before any draft or state assignment. Expected 401, 403, 429, invalid-output, and offline paths use Egyptian-Arabic manual recovery without `console.error`.
- AI disclosure acceptance is versioned. Persist only `aiDisclosureVersion: 1`, `aiDisclosureAcceptedAt` as ISO time, and the existing state timestamp; never persist the food prompt, condition choices, personal/health details, or disclosure contents. The just-in-time copy says only food/quantity is sent, unpaid-tier content may improve Google products, personal/health details must not be entered, and manual entry stays available.
- Tracker cloud writes (create/update on `/trackers/{uid}`) are gated on an owner-provisioned `/betaMembers/{uid}` doc with `enabled == true`. Reads, export, and delete of the user's own tracker are never gated — health data must not be stranded after revocation. Clients can only GET their own membership doc; listing or writing membership docs is denied. sync.js reads that doc at login (`loadMembership()`), shows the pending/not-invited note (`#gate-note`, Egyptian Arabic) proactively, and classifies push failures into pending (403), session-expired (401), and quota (429) copy via `syncFailKind()` while keeping local use working.
- Every pending membership state owns exactly one five-minute recheck. Replacing
  the state replaces or clears that timer, logout clears it, and a successful
  recheck flushes edits accumulated locally while cloud writes were gated.
- Membership reads are latest-read-wins within a sync session, and tracker
  listener/write completions must still match their originating Auth UID,
  tracker reference, and session generation before changing gate or sync UI.
- Native `<datalist>` suggestions deliberately survive wholesale `innerHTML` re-renders and remote merges. Calorie-reference suggestions split stored `"النوع (الكمية)"` titles between `crNames()` and `qtyNames()` so the quantity is not duplicated in AI prompts.
- `MEALS.nt` is retained only for historical saved-day compatibility. Its option indexes and macros must not change. The group is absent from new days and suggestions; a valid saved numeric selection renders as one removable legacy row.
- `rankedExampleDays()` builds exactly 192 combinations from the four groups explicitly marked `examples:true` (`b`, `s`, `l`, `d`). It stays outside `calc.js`, reads no state, excludes custom, extra, optional, and legacy content, and uses the documented deterministic ranking and stable source indexes. The examples tab always renders the top three as approximate examples, never as prescriptions or saved templates.
- `package.json` is the canonical app version. Its exact version must match the root package-lock copies, `APP_VERSION` in `data.js`, the dated changelog section, and the annotated `vX.Y.Z` tag through the shared version-contract validator; the footer renders only the checked runtime copy.
- Install icons are deterministic outputs of `scripts/generate-icons.mjs`; keep the manifest Arabic/RTL and rooted at `/`. Offline-first launch is unsupported: do not add a service worker or relax the HTML/JavaScript `no-store` headers.

### Nutrition and Target Invariants

- `calcTargets()` uses Mifflin-St Jeor BMR times activity. Cutting subtracts `min(1100, max(300, 8.25 * kg))` — a bodyweight-anchored ~0.75%/week rate, not a fraction of TDEE, because activity raises TDEE without raising fat reserves; bulking adds 300 kcal.
- The result is floored at `max(1250, ceil(BMR/50)*50)`, so the app can never prescribe intake below resting metabolism. `ceil` is deliberate: rounding to nearest could land below BMR. The floor binds on sedentary cuts, where 0.75%/week is unreachable above BMR — those users correctly get a smaller deficit. `rateBand()` derives the 0.5–1.0%/week acceptance window the UI copy shows from the same rule; it must stay consistent with the deficit.
- Protein is capped at the 300 g ceiling enforced by `validTargets()`. Calories are deliberately not clamped: out-of-band results must be rejected instead of distorted.
- Target formula behavior lives in `tests/unit/profile.test.mjs`; `calc.js` contains no load-time profile assertions or state-specific migration hooks.
- The `tw` setting is the weight at which targets were last reviewed; it is written by setup, by 🔄 احسب تلقائي, and by dismissing the stale-target note. `renderProg()` prompts only when `targetsMoved()` — a full 50 kcal rounding step, the smallest real change — separates `calcTargets()` at `basisWeight()` from `calcTargets()` at `tw`. Comparing suggestion to suggestion rather than to the stored target is what keeps hand-typed targets from ever being flagged. Both the prompt and the button read `basisWeight()`, the 14-day mean, so day-to-day water weight cannot move either.
- `sw` is the progress baseline for both the milestone ladder and "التغيير من البداية"; it is the declared start weight, not the first logged weigh-in, so the two cards cannot disagree.
- The 75 built-in `MEALS`, `EXTRAS`, and `CALREF` entries must satisfy `|k - (p*4 + f*9 + c*4)| / k <= 10%`. Both `data.js` and `scripts/validate.mjs` enforce this, and `macroMismatch()` surfaces it in the UI.

## Development and Deployment Commands

The app has no runtime build step. Contributor checks use development-only tooling:

- `npm install` installs the development-only formatting tool and configures tracked Git hooks.
- `npm run check` runs formatting checks, JavaScript/data validation, Spark-guard checks, formula assertions, and Firestore rules tests.
- `npm run format` formats Markdown and JSON files; `public/index.html` and the five `public/*.js` files intentionally retain their compact style.
- `firebase emulators:start --only hosting,firestore` serves the app and evaluates Firestore behavior locally.
- `node scripts/release-deploy.mjs vX.Y.Z` is the owner-run production path: it requires successful validation for the exact tag plus a current local release-verification record, verifies provenance and pinned tooling, deploys and verifies tagged Rules/indexes before both Hosting targets, rechecks Spark/config after every live byte matches, and writes a token-free manifest under `local/releases/`.
- `firebase deploy --only firestore:rules` publishes security-rule changes (non-production verification only).

Run a focused unit test with `node --test --test-name-pattern="<name>" tests/unit/<file>.test.mjs`. Run a focused browser test against an already-running emulator with `npx playwright test --project=desktop -g "<name>"`.

Run deployment commands only from the repository root and verify the active project with `firebase use`.

The two Hosting targets serve the same `public/` directory. Keep identical CSP, frame, referrer, permissions, MIME-sniffing, and `no-store` headers on both targets. Firebase's catch-all rewrite can return missing JavaScript as HTTP 200 HTML, so release verification must byte-compare every live file and verify headers on normal and rewritten paths, not only `index.html`. `runtime-resources.json` pins exact URL, length, and SHA-256 for every Firebase SDK import; imports, CSP, release hashes, and live resource verification must remain bound. Releases are driven by annotated `v*` tags, deploy both targets, and publish a GitHub Release entry only after live verification succeeds.

## Coding Style & Naming Conventions

Follow the existing two-space indentation in JavaScript and Firebase JSON. Keep HTML and CSS compact, use double quotes in markup and JavaScript strings, and retain `"use strict"`. Existing JavaScript uses `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants such as `MEALS`, and short kebab-case DOM IDs such as `tab-day`. Keep user-facing copy in Egyptian Arabic and preserve `lang="ar"` and `dir="rtl"`.

Prettier formats Markdown and JSON. `scripts/validate.mjs` checks that every referenced script exists and parses, plus the nutrition data and Firebase JSON. Avoid unrelated reformatting of the app files.

## Testing Guidelines

`npm run check` is the gate the pre-commit hook runs: formatting, `scripts/validate.mjs`, `node --test tests/unit/*.test.mjs`, and emulator-backed Firestore rules tests. `npm run check:static` drops the rules tests when Java 21 is unavailable. Playwright specs run separately inside the emulator: `npx firebase-tools emulators:exec --only auth,firestore,hosting "npm run test:browser"`. Their `afterEach` asserts zero console errors, so any stray `console.error` or failed request fails every spec. The suite is deliberately serialized (`workers: 1` in `playwright.config.mjs`) because parallel workers race the shared Auth emulator's account registry and produced transient HTTP 400s; keep it serialized unless that failure mode is diagnosed and fixed.

Beyond the suites, exercise login/logout, profile setup, daily entry persistence, tab navigation, import/export, and mobile layouts before submitting.

`TEST_MODE` is active only on localhost or `127.0.0.1` with `?test=1`. It connects Auth and Firestore emulators, signs in anonymously, and skips App Check; production hosts ignore the flag. Keep `window.__dietTest` exports in `sync.js` aligned with browser-test needs.

## Health-Content Changes

Treat calorie, macro, projection, and recommendation changes as evidence-sensitive. `project()` uses a linear 7,700 kcal/kg approximation that ignores adaptive thermogenesis and must not be presented as a measurement. Check primary sources such as USDA FoodData Central, ISSN, FDA, NIH ODS, CDC, and IOM DRI before changing nutrition data or recommendation logic.

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
5. **Release:** Follow `docs/releasing.md`. Release only an annotated Semantic Version tag from reviewed, green `main`; complete the ignored local verification record; deploy from the exact tag with `scripts/release-deploy.mjs`; then run the publication command it prints. The script and workflow verify provenance, the successful tag-validation run, tagged Rules/index/bundle hashes, and every public live byte. GitHub holds no Google or Firebase credential at any point.

The publish job keeps read-only repository contents except its own scoped token for Releases; no WIF provider, service account key, or long-lived Firebase token exists anywhere. If deployment or byte verification fails in `scripts/release-deploy.mjs`, fix it through a new `fix/*` branch and reviewed PR, update `main`, and publish a new SemVer tag. If code/config must change after a partial deploy of unchanged tagged artifacts, never reuse the tag: fix forward with a new SemVer tag. Never move or reuse a published release tag, and do not run raw `firebase deploy` against production outside the reviewed script (non-production rules experiments aside).

## Security & Configuration

Never commit service-account keys, `.env` files, exported user data, completed release-verification records, console captures, or debug logs. Production deployment uses the owner's human Firebase and Google Cloud OAuth sessions locally; GitHub receives no Google credential. Treat changes to `firestore.rules`, `firestore.indexes.json`, Firebase project mappings, authentication, and import handling as security-sensitive.
