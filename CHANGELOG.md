# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.8.0] - 2026-08-25

### Changed

- واجهة التطبيق بقت مركزة على التسجيل اليومي، التقدم، ومرجع السعرات؛ صفحة الخطة
  المخصصة والقوالب اليومية الجاهزة مش متاحة مؤقتًا.
- اختيارات مجموعة الوجبة القديمة مبقتش تظهر في الأيام الجديدة أو اقتراحات الأكل.
  اليوم المحفوظ قبل التغيير بيعرض اختياره القديم فقط، مع إمكانية إلغائه ومن غير
  تغيير رقم الاختيار أو الماكروز المحفوظة.
- مرجع السعرات يحتفظ بباقي بياناته المدمجة، بإجمالي 75 إدخالًا بعد إزالة إدخال
  منتج غير مستخدم، مع استمرار تحقق تطابق السعرات والماكروز.

### Removed

- المحتوى الصحي المخصص، بيانات الملف الافتراضية القديمة، ترحيل ملف محدد،
  والإسناد الظاهر لأداة الإنشاء من الملفات الحالية.
- لقطات الشاشة القديمة من المستودع. توضح الوثائق أن نسخًا من مواد منشورة سابقًا
  قد تظل موجودة في الالتزامات والعلامات والأرشيفات والنسخ المحلية وذاكرات التخزين
  المؤقتة الأقدم.

## [3.7.0] - 2026-08-24

### Added

- مرجع السعرات بقى فيه خانات كاملة للسعرات والبروتين والدهون والكارب وزر حفظ
  يدوي، فالمسار اليدوي يفضل شغال سواء تقدير AI متوقف أو فشل.
- مسار AI الجاهز للإصدار اللاحق بيعرض إفصاحًا عربيًا قبل أول استخدام، وبيحفظ
  رقم نسخة الإفصاح ووقت الموافقة بس. رسائل الاسترجاع بقت تفرّق بين انتهاء
  الجلسة، وفشل App Check أو الصلاحية، وخلاص الحصة، وعدم الاتصال.

### Changed

- Firebase Web SDK بقى مثبتًا على 12.17.1 في تطبيق modular واحد مشترك بين Auth
  وFirestore وApp Check وAI، من خلال واجهة محدودة للسكريبتات الخمسة الحالية.
  مفيش تطبيق Firebase تاني، ولا compat SDK، ولا نسخ لتوكنات الدخول.
- موديل التقدير بقى مثبتًا على `gemini-3.5-flash-lite`. كل طلب مفعّل لازم يعمل
  قراءة جديدة من السيرفر لحالة `/betaMembers/{uid}` قبل استدعاء الموديل، وأي
  فشل يمنع الطلب بدل الاعتماد على حالة مخزنة.
- ناتج AI بيتقبل فقط لو فيه الأربع قيم الرقمية `k/p/f/c` من غير حقول زيادة،
  داخل الحدود المدعومة ومتوافق مع حساب طاقة الماكروز في حدود 10%، وبعدها بس
  بيتقرب لأرقام صحيحة ويتحط في النموذج.
- عقد التحقق الخاص بالإصدار بقى على مرحلتين حسب قيمة `AI_ENABLED` المقروءة من
  ملفات الإصدار نفسها. إصدار 3.7.0 المتوقف بيسجل الوضع الحالي وخطة التفعيل من
  غير ادعاء نجاح إعدادات أو اختبارات لسه متعملتش؛ وأي إصدار مفعّل لازم يثبت
  وضع Auth وApp Check، وكل حاويات المناطق للحصة بأسماء المناطق الفعلية،
  والسجلات، واختبارات المضيفين.

### Security

- AI يفضل متوقفًا في أول إصدار 3.7.0 (`window.AI_ENABLED=false`)؛ الأزرار
  مخفية ومفيش طلب AI أو قراءة عضوية مرتبطة به. التفعيل مش هيتم قبل مراجعة
  إعدادات Firebase واختبارات المضيفين، ومتوقع يكون تغيير الفلاج فقط في إصدار
  منفصل 3.7.1.
- وقت قبول إفصاح AI لازم يكون بصيغة ISO الكاملة اللي التطبيق نفسه بيكتبها؛ أي
  قيمة مستوردة بصيغة مختلفة مش هتمنع ظهور الإفصاح.

## [3.6.3] - 2026-08-24

### Fixed

- لو تفعيل الحساب التجريبي اتعمل بعد ما التطبيق كان فتح، التطبيق بيراجع العضوية
  كل خمس دقايق، ولما يلاقي الحساب اتفعّل بيبعت للسحابة التسجيلات اللي اتحفظت على
  الجهاز من غير ما يحتاج تحديث الصفحة.

## [3.6.2] - 2026-08-24

### Added

- تسجيل اليوم على السحابة بقى محتاج حساب مفعّل في البرنامج التجريبي. لو الحساب
  لسه مش مفعّل أو اتلغى تفعيله، التطبيق بيوضّح ده من الأول بملاحظة واضحة، وبيفرّق
  بين رسالة الحساب غير المفعّل، وانتهاء الجلسة، وخلاص حصة السحابة. في كل الحالات
  التسجيل على الجهاز والنسخة الاحتياطية والحذف بيفضلوا شغالين عادي.

### Changed

- تقدير السعرات بالذكاء الاصطناعي متوقف مؤقتًا في الإصدار ده: أزرار 🤖 اختفت،
  وكتابة السعرات والماكروز بالإيد هي المسار الوحيد في كل الشاشات. التقدير هيرجع
  بعد اكتمال مراجعة الأمان والخصوصية والحصة في الإصدار الجاي.
- Production deploys are owner-run with human Firebase OAuth via
  `scripts/release-deploy.mjs`; GitHub Actions no longer authenticates to
  Google, deploys Hosting, or creates preview channels. The tag-triggered
  validation workflow verifies tag provenance and records bundle checksums with zero cloud
  credentials, and a hand-triggered publish workflow re-verifies provenance and
  every public live byte before creating the Release entry.
- Hardened the owner release path so production mutation requires the exact
  successful tag validation and a current local Firebase verification record;
  active Rules, canonical indexes, ready composite indexes, tagged hashes, live
  bytes, and a repeated post-deploy Spark/config check are independently verified.
- Consolidated release instructions in `docs/releasing.md` and removed obsolete
  roadmap checklists that described application flows not present in the shipped
  data model.
- The Playwright browser suite runs serialized (`workers: 1`) because parallel
  workers raced the shared Auth emulator's account registry and produced
  transient HTTP 400s.

### Security

- Firestore Rules now gate tracker create/update on an owner-provisioned
  `/betaMembers/{uid}` document with `enabled == true`, while tracker reads and
  deletes stay available to the owner after revocation so health data is never
  stranded. Clients can only get their own membership doc; listing and every
  client write on `betaMembers` is denied.
- The shipped client disables AI estimation behind `window.AI_ENABLED=false`
  until the next release's Auth, App Check, model, privacy, and quota acceptance
  passes; the named `"ai"` app wiring stays intact for a clean re-enable.
- Documented the deployment ordering requirement in `docs/releasing.md`: the
  compatible client and membership Rules go live before App Check enforcement
  is switched on for Firestore in the console, followed by member/non-member/
  revoked spot checks.
- Added the Spark guard to `scripts/validate.mjs` (via `scripts/spark-guard.mjs`
  with unit coverage): config, dependency, workflow, and AI-module allowlists
  keep Functions/App Hosting/Storage configuration, server-side Firebase SDKs,
  CI deploy/GCP-authentication steps, and non-allowlisted AI backends or models
  out of the repository.
- Closed common Spark-guard bypasses involving alternate Firebase CLI commands,
  direct Google Cloud commands, optional/package-alias server dependencies,
  dynamic Hosting rewrites or extra sites, runtime-selected AI models, TTL, and
  vector/search index configuration.

## [3.5.1] - 2026-08-05

### Fixed

- اختيار وجبة قديم مبقاش يظهر للأيام الجديدة، لكنه يفضل ظاهرًا عند فتح يوم كان
  الاختيار محفوظًا فيه عشان يقدر المستخدم يلغيه من غير تغيير السجل.

## [3.5.0] - 2026-08-05

### Added

- إضافات لجدول بيانات التغذية مع الحفاظ على توافق أرقام الاختيارات المحفوظة.

### Changed

- Unit and browser coverage verifies calorie reconciliation, preserved legacy
  meal indexes, persistent selections, and RTL responsive layout.

## [3.4.1] - 2026-07-31

### Fixed

- "التغيير من البداية" في صفحة التقدم بقى محسوب من وزن البداية اللي انت كاتبه، مش من
  أول وزن مسجّل في التطبيق — فلو قِست قبل ما تبدأ التسجيل اليومي، القياس ده مبقاش
  بيتلغي، وجدول المراحل والكارت بقوا متفقين على نفس نقطة البداية.
- `renderProg()` now anchors the change-from-start stat on `settings.sw` instead of
  `weightSeries()[0]`, matching the milestone ladder. A single logged weigh-in now
  reports a real delta rather than `0`.

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
  below resting metabolism.

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
- Consolidated repository guidance in `AGENTS.md` and documented the reviewed
  branch-to-release cycle.

### Removed

- `scripts/validate.mjs` no longer reimplements Mifflin-St Jeor; the unit test
  asserts formula behavior against the app's own `calcTargets`.
- `SECURITY.md` and `PRIVACY.md`. `public/privacy.html` is the canonical
  privacy policy; the contributor-facing security guidance moved into
  `AGENTS.md`.

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

- Adult profile validation.
- Macro consistency warnings for user-created foods.
- Contributor and health-review handoff documentation.

### Changed

- Based fat-loss protein targets on goal weight.
- Updated the displayed app version to 3.1.

### Fixed

- Prevented exercise calories from being counted twice.
- Clamped generated calorie targets to the setup validation floor.
- Aligned food-reference calories with their displayed portions and macros.
- Applied consistent bounds and ordering checks to editable profile targets.

### Security

- Restricted automated profile guidance to adults and rejected unsafe goal-weight ranges.
