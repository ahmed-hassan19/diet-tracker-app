# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the contributor-facing conventions (style, commit format, deploy commands, security posture) and still applies.

Never commit service-account keys; deploys authenticate through short-lived GitHub OIDC credentials.

## Commands

```sh
npm run check          # format:check + lint + test:unit + test:rules — what the pre-commit hook runs
npm run check:static   # same minus test:rules (no Java/emulator needed)
npm run lint           # scripts/validate.mjs — parses public/*.js and index.html
npm run test:unit      # node --test tests/unit/*.test.mjs
npm run test:rules     # boots the Firestore emulator (needs Java 21 on PATH)

# one unit test
node --test --test-name-pattern="reviewed profile" tests/unit/profile.test.mjs

# browser tests — must run inside the emulator, they hit http://127.0.0.1:5005/?test=1
npx firebase-tools emulators:exec --only auth,firestore,hosting "npm run test:browser"
npx playwright test --project=desktop -g "persists meal totals"   # single, emulator already up
```

Playwright's `afterEach` asserts the console produced **zero** errors, so any stray `console.error`, failed fetch, or blocked script fails every spec, not just the one that triggered it.

## Architecture

There is no build step — the deployed files are the source files. `public/index.html` (~275 lines) is markup, CSS, and the AI module; the app logic is five plain classic scripts it loads in order:

| File        | Holds                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data.js`   | `MEALS`, `EXTRAS`, `CALREF` and their `console.assert`s, `WORKOUTS`, `DEF`                                                                                                       |
| `calc.js`   | `calcTargets`, `validProfile`, `validTargets`, `macroHints`, `macroMismatch`, `macros`, `TLIMITS` — **no state access, no data tables**                                          |
| `state.js`  | `S`, `KEY`, `load`/`save`, `migrateReviewedProfile`, `day`, `esc`, `weightSeries`, export/import, and the state-reading accessors `T`, `getOpt`, `getExtra`, `totals`, `project` |
| `render.js` | the four tab renderers, `drawChart`, and every UI handler                                                                                                                        |
| `sync.js`   | Firebase auth/sync, `TEST_MODE`, `window.__dietTest`, and the trailing `initSync()`                                                                                              |

They are **classic scripts, not modules**, deliberately: one shared global scope means bindings resolve across files as they did inside the old single block, and the 34 inline `onclick=` handlers keep working with no `window.x = x` shims. Load order is the dependency order; `sync.js` must stay last because it ends with the `initSync()` call. Anything new that reads `S` belongs in `state.js` or later, never `calc.js`.

That last rule is **enforced, not aspirational**: `tests/unit/profile.test.mjs` `vm`-runs `calc.js` on its own, with neither `data.js` nor a state object in scope, so a reference to `S`, `MEALS`, or the DOM from `calc.js` fails the unit suite at load. `T()`/`project()` read `S.settings` and `totals()` needs `getOpt`/`getExtra`, which is why all four sit in `state.js` despite being calculation-shaped.

**Two Firebase SDKs.** The classic scripts lazily `loadScript()` the **compat** SDK v10.14.1 (app / auth / firestore / app-check) for auth and sync. The one remaining inline block is `<script type="module">`: the **modular** SDK v12.9.0, initializing a _second_ named Firebase app (`"ai"`) purely for `aiEstimate()` (Gemini via `getGenerativeModel`, `gemini-flash-lite-latest`, JSON response schema), with its own App Check instance. Modules execute after all classic scripts, so it resolves `FB_BUILTIN`/`TEST_MODE` from the global scope. `validate.mjs` asserts exactly one inline block and that every `src="./*.js"` resolves to a real file.

**Don't change the model back to `gemini-flash-latest`.** That alias floats across the whole Flash line and silently drifted onto something that took 4–5 s per estimate. `gemini-flash-lite-latest` is pinned to the Lite tier, whose purpose is low latency, so a hot-swap inside it can't reproduce that regression — measured 0.8–1.3 s. The alias is preferred over a pinned version (`gemini-3.5-flash-lite`) only because pinned strings eventually 404 on model retirement; latency is the reason for _Lite_, not for _latest_. Lite was accuracy-checked against `CALREF` (بيضة مسلوقة 78→78, رغيف بلدي 173→150, صدور فراخ 165→165, ملعقة زيت 126→120; mean absolute error 4.5%). Re-run that check if the model changes.

**Calorie/protein target pipeline** (`calcTargets` → `validTargets` in `calc.js`):

- Mifflin-St Jeor BMR × activity → TDEE; cut = −min(900, max(300, 20% TDEE)), bulk = +300.
- Protein is clamped to the 300 g ceiling `validTargets` enforces.
- Calories are deliberately **not** clamped — an earlier 6000 ceiling inverted the intended deficit for extreme profiles, so out-of-band results are now rejected instead. `recalcTargets()` gates on `validTargets()` and alerts rather than saving a distorted target. Don't reintroduce an energy clamp.
- The reviewed-profile expected values (`tdee 3220 / klo 2550 / khi 2650 / plo 172 / phi 189`) are asserted in **two** places: the `console.assert` IIFE in `calc.js`, and `tests/unit/profile.test.mjs`. Any formula change must update both. `validate.mjs` used to carry a third, hand-reimplemented copy of Mifflin-St Jeor — it was deleted; the unit test executes the real `calcTargets` instead, and `check:static` runs lint and unit tests together.
- `migrateReviewedProfile()` / `REVIEWED_PROFILE_VERSION` fingerprint one specific real user's profile and rewrite their stored targets on load. Bump the version when the formula changes.

**Food data invariant:** every entry in `MEALS`/`EXTRAS`/`CALREF` must satisfy `|k − (p·4 + f·9 + c·4)| / k ≤ 10%`. Enforced by a `console.assert` in `data.js`, by `validate.mjs` (which `vm`-runs `data.js`), and surfaced in the UI through `macroMismatch()`.

**Storage:** `S` is the single in-memory state object, mirrored to `localStorage["diet_tracker_v1_" + uid]` by `save()`, which also `schedulePush()`es a debounced Firestore write to `/trackers/{uid}`. Remote snapshots merge back via `mergeRemote()`. `firestore.rules` allows access only when `request.auth.uid == uid`.

**Test mode:** `TEST_MODE` is true only on localhost/127.0.0.1 with `?test=1` — it points auth/firestore at the emulators, signs in anonymously, and skips App Check. Production hosts ignore the flag. `window.__dietTest` (in `sync.js`) exposes `calcTargets`, `validProfile`, `validTargets`, `macroMismatch`, `totals`, and state accessors for the browser specs.

**Hosting:** one Firebase project (`diet-tracker-372ca`) serves two targets from the same `public/` — `main` (diet-tracker-372ca.web.app) and `nice` (5asesny.web.app). `authDomain` is switched at runtime based on `location.hostname`. Releases are driven by annotated `v*` tags, which deploy both targets and byte-compare every live file against the tagged `public/`.

Two hosting traps worth knowing:

- The catch-all `rewrites` rule returns **HTTP 200 with `content-type: text/html`** for a missing `.js` — not a 404 — so a partially-uploaded deploy silently ships an app whose scripts the browser refuses to execute. The per-file `cmp` loop in `release.yml` is what turns that into a red build; don't shrink it back to checking `index.html` alone.
- `firebase.json` carries a `**/*.js` `no-store` header on **both** targets alongside `**/*.html`. Without it the JS defaults to `max-age=3600`, and a returning user gets fresh HTML against up-to-an-hour-stale logic.

## Health-content changes

The formulas, food values, and recommendation copy came out of a nutrition review whose write-up (`DIET_HEALTH_REVIEW_HANDOFF.md`) has been retired. Its numeric claims were re-derived from the code and its sources re-fetched; what survived that check and still constrains the code:

- The **7–10 month** projection to 86 kg assumes 🔄 is re-run as weight drops (~35 weeks). Held at a fixed target, the app's own `project()` gives ~48 weeks, because TDEE falls with weight while intake does not.
- Protein (2.0–2.2 g/kg of **goal** weight) is adapted _downward_ from [PMID 34579132](https://pubmed.ncbi.nlm.nih.gov/34579132/), which recommends 2.2–3.0 g/kg. That paper is not a citation for the app's number; the result does sit inside the ISSN 1.4–2.0 g/kg band.
- Carbohydrate at 274–308 g is 42.2–47.4% of 2,600 kcal — just under the 45–65% AMDR band, deliberately, as the cost of a protein-forward deficit.
- The rate line and `project()` both use the linear 7,700 kcal/kg rule, which overstates loss (it ignores adaptive thermogenesis). The plan page says so; don't quietly present it as a measurement.

Verify against primary sources (USDA FoodData Central, ISSN, FDA, NIH ODS, CDC, IOM DRI) before changing any calorie, macro, or recommendation logic.
