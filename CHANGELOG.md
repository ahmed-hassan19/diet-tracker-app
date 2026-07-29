# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- خانات الأكل الحرة بتقترح عليك الأكلات اللي سجلتها قبل كده مع أكلات الخطة
  الجاهزة، ولو اخترت أكلة متسجلة بيتملى السعرات والبروتين والدهون والكارب
  تلقائيًا. الاقتراحات كمان في خانتي النوع والكمية في مرجع السعرات.

### Changed

- Split the inline script block in `public/index.html` into five classic
  scripts (`data.js`, `calc.js`, `state.js`, `render.js`, `sync.js`). Pure code
  move, no behavior change.
- `scripts/validate.mjs` and `tests/unit/profile.test.mjs` now load the real
  source files instead of scraping the HTML as text.
- Production hosting sends `no-store` for `**/*.js`, and the tagged-release
  byte-compare covers every deployed file rather than only `index.html`.

- 🤖 calorie estimates now use `gemini-flash-lite-latest` instead of
  `gemini-flash-latest`, cutting a round trip from ~4–5 s to ~0.8–1.3 s. A
  four-item spot-check against the built-in calorie reference put the new
  model's mean absolute error at 4.5%; the old model was not re-measured.

### Removed

- `scripts/validate.mjs` no longer reimplements Mifflin-St Jeor; the unit test
  asserts the reviewed profile against the app's own `calcTargets`.
- `SECURITY.md` and `PRIVACY.md`. `public/privacy.html` is the canonical
  privacy policy; the key security note moved into `CLAUDE.md`.

## [3.2.0] - 2026-07-27

### Added

- Private-repository governance, ownership, security, privacy, and contribution
  documentation.
- Emulator-backed Firestore rules, profile, persistence, import/export,
  deletion, RTL, and responsive browser checks.
- GitHub Actions quality, expiring pull-request preview, and tagged production
  release workflows using short-lived Workload Identity credentials.
- Invisible reCAPTCHA v3 App Check tokens in monitoring mode for production
  Firestore and Firebase AI traffic.
- Arabic privacy information, export guidance, and two-step delete-all controls.

### Changed

- Updated the application and visible footer to 3.2.0.
- Extended local checks and Git hooks with fast unit and Firestore rules tests.

### Security

- Delete-all stops synchronization before removing the authenticated tracker
  document and clears local data only after cloud deletion succeeds.
- Documented API-key restrictions and deferred App Check enforcement until
  production and preview metrics are understood.

## [3.1.0] - 2026-07-27

### Added

- Adult profile validation and a one-time migration for the reviewed profile.
- Macro consistency warnings for user-created foods.
- Evidence-based guidance for hypotension, hydration, knee rehabilitation, and supplements.
- Contributor and health-review handoff documentation.

### Changed

- Rebalanced default meals around a 2,550–2,650 kcal reviewed target.
- Based fat-loss protein targets on goal weight.
- Replaced fixed water, step, workout-burn, meal-timing, and diet-break claims with individualized guidance.
- Updated the displayed app version to 3.1.

### Fixed

- Prevented exercise calories from being counted twice.
- Clamped generated calorie targets to the setup validation floor.
- Aligned food-reference calories with their displayed portions and macros.
- Applied consistent bounds and ordering checks to editable profile targets.

### Security

- Restricted automated profile guidance to adults and rejected unsafe goal-weight ranges.
