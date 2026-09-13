# Repository Guidelines

## Application constraints

This is a dependency-free, build-step-free Firebase application. `public/index.html`
contains Egyptian-Arabic RTL markup, styles, and the single Firebase module. The
classic scripts load in dependency order: `data.js`, `calc.js`, `state.js`,
`render.js`, `sync.js`. Keep `calc.js` independent of state and nutrition tables;
keep `sync.js` last because it calls `initSync()`. Preserve inline event handlers.

Keep user-facing copy in Egyptian Arabic, `lang="ar"`, and `dir="rtl"`. Preserve
existing compact HTML/JavaScript style and avoid unrelated reformatting.

All state imports, cache reads, mutations, and remote snapshots pass through
`normalizeState()`. Preserve UID isolation, verified durable imports and catalog deletions before
live state changes, and recovery from malformed remote data. Ordinary edits use
serialized asynchronous persistence; failures must remain visible. Signed-in users
can read, write, export, and delete their own data without beta membership.

Use one modular Firebase app through `window.firebaseBridge`; do not introduce a
compat stack, another app, or copied Auth/App Check tokens. Keep AI drafts manual
until accepted, preserve authentication, App Check, and disclosure, and never persist food
prompts or personal/health details. Offline-first launch is unsupported; do not add
a service worker or relax HTML/JavaScript `no-store` headers.

## Read when relevant

- For state, synchronization, authentication, Firebase/AI, installation, versioning,
  or saved-data compatibility changes, read **Architecture Invariants** in
  [docs/development-contracts.md](docs/development-contracts.md).
- For nutrition data, targets, projections, or recommendations, read **Nutrition
  and Target Invariants** in that reference and verify primary sources before
  changing evidence-sensitive behavior. The linear 7,700 kcal/kg projection is an
  approximation, not a measurement.
- For release preparation or deployment, read **Release-Driven Workflow** in that
  reference and [docs/releasing.md](docs/releasing.md).

## Development and verification

Run commands from the repository root. `npm install` installs development tooling
and configures tracked Git hooks; the app itself has no runtime build step.

- `npm run check:static`: required pre-commit gate for formatting, validation,
  unit tests, and Spark guards.
- `npm run check`: full gate, adding emulator-backed Firestore rules tests. CI
  runs it on PRs and pushes to `main`; disclose omitted rules tests locally.
- `node --test --test-name-pattern="<name>" tests/unit/<file>.test.mjs`: focused unit tests.
- `npx firebase-tools emulators:exec --only auth,firestore,hosting "npm run test:browser"`:
  browser suite. Against running emulators, use
  `npx playwright test --project=desktop -g "<name>"` for affected cases.
- `npm run format`: formats Markdown and JSON; application HTML/JS remains compact.

Run checks relevant to the change and retain required commit/CI gates. Exercise
login, profile setup, persistence, navigation, import/export, and mobile layouts
when the change affects those flows. Broaden or repeat checks only after changes,
failures, or unresolved concerns justify it.

Desktop retains the complete browser suite. Mobile covers responsive RTL layouts,
setup, custom entries/import-export, suggestions, chart touch/dismissal, deletion,
and destructive confirmations; viewport-independent matrices run on desktop.

Keep Playwright serialized (`workers: 1`): parallel workers race the shared Auth
emulator registry. Browser tests assert zero console errors. `TEST_MODE` is valid
only on localhost/127.0.0.1 with `?test=1`; production ignores it. Keep
`window.__dietTest` exports aligned with browser-test needs.

## Changes and publication

Use a focused `feature/*` or `fix/*` branch from current `main`; do not develop or
commit directly on `main`. Use Conventional Commits. Update `CHANGELOG.md` under
`Unreleased` for user-visible changes. PRs describe behavior, relevant checks,
issues, UI evidence when applicable, and security/configuration impact.

Keep private working material, prompts, scratch notes, local planning paths, and
agent/tool provenance out of repository and GitHub artifacts. Inspect staged
changes and publication text for those details. Use ordinary engineering language
and `#` notation for numbered references.

Production releases use reviewed, green `main`, an annotated SemVer tag, and the
owner-run `scripts/release-deploy.mjs` procedure. Never move/reuse published tags or
run raw `firebase deploy` against production. Verify the active project before
deployment. Both Hosting targets serve the same bundle and must retain identical
security/cache headers; live verification compares all deployed bytes, including
rewritten paths, and pinned SDK resources. Publish the GitHub Release only after
successful live verification. Preserve the version-contract validator.

Never commit credentials, `.env`, exported user data, release-verification records,
console captures, debug logs, or `.firebase/` cache data. Production credentials
remain in the owner's local OAuth sessions; GitHub receives no Google credential.
Treat Firestore rules/indexes, project mappings, authentication, and import handling
as security-sensitive.
