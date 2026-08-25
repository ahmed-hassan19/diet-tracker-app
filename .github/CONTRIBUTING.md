# Contributing

`AGENTS.md` is the canonical contributor guide for architecture, testing, health-content review, security, pull requests, and releases. Read it before changing the application.

## Change workflow

1. Update local `main` with `git pull --ff-only origin main`, then create a focused `feature/*`, `fix/*`, or `chore/*` branch.
2. Keep user-visible changes under `Unreleased` in `CHANGELOG.md` and use Conventional Commits.
3. Open a pull request that explains the behavior change, checks, linked issues, Firebase/security impact, and UI evidence where applicable.
4. Merge only after review, the quality workflow, and the browser suite pass. There is no preview deployment; review locally with the emulators.

Firebase AI changes must preserve the one modular app and five classic scripts,
keep manual entry working, and update the fail-closed release-verification
contract. Never commit App Check debug tokens, console evidence, completed local
verification records, prompt/response logs, or API credentials.

State or rendering changes must preserve the normalized mutation/import/remote
boundary, IndexedDB write ordering and verified legacy migration, and literal
DOM rendering. New dynamic UI uses DOM nodes and listeners; it must not add HTML
sinks, generated inline handlers, or unreviewed CSP hashes. Changes to Firebase
SDK imports require the runtime-resource manifest, CSP, release hashes, and live
resource verification to move together.

## Publishing a release

Follow [the release guide](../docs/releasing.md). Production deploys are
owner-run with human Firebase OAuth; GitHub holds no Google or Firebase
credential. Release only an annotated tag from reviewed `main`, use the checked
in deployment script, and never move or reuse a published tag.
