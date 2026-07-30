# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.4.0] - 2026-07-30

### Added

- لما وزنك ينزل كفاية عشان المقترح يتغيّر فعلًا، صفحة التقدم بتوريك ملاحظة
  بتقارن هدفك الحالي بالمقترح الجديد ومستنية قرارك — تطبّق أو تحتفظ بهدفك، ومش
  بيتغير أي رقم من نفسه. الملاحظة محسوبة على متوسط وزنك آخر ١٤ يوم عشان مياه
  يوم واحد متطلّعهاش، ولو هدفك مكتوب بإيدك مش هيتنبّه عليه غير لما الاقتراح نفسه
  يتحرك.
- A new `tw` setting records the weight at which targets were last reviewed, and
  `renderProg()` prompts when `calcTargets()` at the 14-day mean weight differs
  from `calcTargets()` at `tw` by a full 50 kcal rounding step. Applying the
  suggestion or keeping the current target both write `tw`, so dismissal needs
  no separate flag and the prompt cannot re-fire on noise. `basisWeight()` also
  now feeds 🔄 احسب تلقائي, which previously read a single weigh-in.

### Changed

- العجز في السعرات بقى مربوط بوزن جسمك (~0.75% من الوزن كل أسبوع) بدل نسبة من
  إجمالي الحرق، فالنشاط الزيادة مبقاش يكبّر العجز — التمرين بيرفع الحرق بس مش
  بيرفع مخزون الدهون. وزيادة على كده التطبيق مبقاش يقترح سعرات أقل من حرق
  الراحة (BMR) نهائيًا، فلو نشاطك قليل هتلاقي العجز أصغر ومعاه نصيحة تزوّد
  النشاط بدل إنك تقلّل الأكل أكتر. شباك معدل النزول المقبول بقى محسوب من وزنك
  (0.5–1.0% أسبوعيًا) بدل رقم ثابت.
- `calcTargets()` now derives the cut deficit from bodyweight,
  `min(1100, max(300, 8.25 * kg))`, instead of `min(900, max(300, 20% of TDEE))`,
  and floors every result at `max(1250, ceil(BMR/50)*50)` so no target can fall
  below resting metabolism. The reviewed profile moves from 2550–2650 to
  2300–2400 at 105.5 kg and reads 2250–2350 at 99.6 kg;
  `REVIEWED_PROFILE_VERSION` is bumped to 3 so stored targets are rewritten, and
  its weight fingerprint now matches from 95 kg rather than 100 kg.

## [3.3.0] - 2026-07-29

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
- Consolidated repository guidance in `AGENTS.md`, documented the reviewed
  branch-to-release cycle, and made local tool-specific instruction files
  pointers to that single source of truth.

### Removed

- `scripts/validate.mjs` no longer reimplements Mifflin-St Jeor; the unit test
  asserts the reviewed profile against the app's own `calcTargets`.
- `SECURITY.md` and `PRIVACY.md`. `public/privacy.html` is the canonical
  privacy policy; the contributor-facing security guidance moved into
  `AGENTS.md`.
- The tracked `CLAUDE.md`; local compatibility copies now point to the
  canonical `AGENTS.md`.

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
