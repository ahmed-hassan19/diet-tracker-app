# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the contributor-facing conventions (style, commit format, deploy commands, security posture) and still applies — except its "Testing Guidelines" section, which is stale: automated tests exist (see below).

## Commands

```sh
npm run check          # format:check + lint + test:unit + test:rules — what the pre-commit hook runs
npm run check:static   # same minus test:rules (no Java/emulator needed)
npm run lint           # scripts/validate.mjs — parses public/index.html
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

The whole app is `public/index.html` (~1300 lines): markup, CSS, state, nutrition data, and Firebase wiring. There is no build step — the deployed file is the source file.

**Two script blocks, two Firebase SDKs.** `scripts/validate.mjs` hard-fails if the count isn't exactly 2.

1. Classic `<script>`: app logic. Lazily `loadScript()`s the **compat** SDK v10.14.1 (app / auth / firestore / app-check) for auth and sync.
2. `<script type="module">`: the **modular** SDK v12.9.0, initializing a _second_ named Firebase app (`"ai"`) purely for `aiEstimate()` (Gemini via `getGenerativeModel`, `gemini-flash-latest`, JSON response schema). It gets its own App Check instance.

**Tooling parses the HTML as text.** `validate.mjs` regex-matches `const MEALS = …;\nconst EXTRAS = …;` and `const CALREF=…;\nconsole.assert`; `tests/unit/profile.test.mjs` locates functions by scanning for `function <name>(` and brace-matching. Renaming those bindings, reformatting the data literals, or nesting those functions breaks lint/tests even though the app still runs.

**Calorie/protein target pipeline** (`calcTargets` → `validTargets`, around line 356):

- Mifflin-St Jeor BMR × activity → TDEE; cut = −min(900, max(300, 20% TDEE)), bulk = +300.
- Protein is clamped to the 300 g ceiling `validTargets` enforces.
- Calories are deliberately **not** clamped — an earlier 6000 ceiling inverted the intended deficit for extreme profiles, so out-of-band results are now rejected instead. `recalcTargets()` gates on `validTargets()` and alerts rather than saving a distorted target. Don't reintroduce an energy clamp.
- The reviewed-profile expected values (`tdee 3220 / klo 2550 / khi 2650 / plo 172 / phi 189`) are asserted in **three** places: the inline `console.assert` IIFE in `index.html`, the `reviewedProfile` block in `scripts/validate.mjs`, and `tests/unit/profile.test.mjs`. Any formula change must update all three.
- `migrateReviewedProfile()` / `REVIEWED_PROFILE_VERSION` fingerprint one specific real user's profile and rewrite their stored targets on load. Bump the version when the formula changes.

**Food data invariant:** every entry in `MEALS`/`EXTRAS`/`CALREF` must satisfy `|k − (p·4 + f·9 + c·4)| / k ≤ 10%`. Enforced by an inline `console.assert`, by `validate.mjs`, and surfaced in the UI through `macroMismatch()`.

**Storage:** `S` is the single in-memory state object, mirrored to `localStorage["diet_tracker_v1_" + uid]` by `save()`, which also `schedulePush()`es a debounced Firestore write to `/trackers/{uid}`. Remote snapshots merge back via `mergeRemote()`. `firestore.rules` allows access only when `request.auth.uid == uid`.

**Test mode:** `TEST_MODE` is true only on localhost/127.0.0.1 with `?test=1` — it points auth/firestore at the emulators, signs in anonymously, and skips App Check. Production hosts ignore the flag. `window.__dietTest` exposes `calcTargets`, `validProfile`, `validTargets`, `macroMismatch`, `totals`, and state accessors for the browser specs.

**Hosting:** one Firebase project (`diet-tracker-372ca`) serves two targets from the same `public/` — `main` (diet-tracker-372ca.web.app) and `nice` (5asesny.web.app). `authDomain` is switched at runtime based on `location.hostname`. Releases are driven by annotated `v*` tags, which deploy both targets and byte-compare the live response against the tagged file.

## Health-content changes

The formulas, food values, and recommendation copy came out of a nutrition review whose write-up (`DIET_HEALTH_REVIEW_HANDOFF.md`) has been retired. Its numeric claims were re-derived from the code and its sources re-fetched; what survived that check and still constrains the code:

- The **7–10 month** projection to 86 kg assumes 🔄 is re-run as weight drops (~35 weeks). Held at a fixed target, the app's own `project()` gives ~48 weeks, because TDEE falls with weight while intake does not.
- Protein (2.0–2.2 g/kg of **goal** weight) is adapted _downward_ from [PMID 34579132](https://pubmed.ncbi.nlm.nih.gov/34579132/), which recommends 2.2–3.0 g/kg. That paper is not a citation for the app's number; the result does sit inside the ISSN 1.4–2.0 g/kg band.
- Carbohydrate at 274–308 g is 42.2–47.4% of 2,600 kcal — just under the 45–65% AMDR band, deliberately, as the cost of a protein-forward deficit.
- The rate line and `project()` both use the linear 7,700 kcal/kg rule, which overstates loss (it ignores adaptive thermogenesis). The plan page says so; don't quietly present it as a measurement.

Verify against primary sources (USDA FoodData Central, ISSN, FDA, NIH ODS, CDC, IOM DRI) before changing any calorie, macro, or recommendation logic.
