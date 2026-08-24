# Contributing

`AGENTS.md` is the canonical contributor guide for architecture, testing, health-content review, security, pull requests, and releases. Read it before changing the application.

## Change workflow

1. Update local `main` with `git pull --ff-only origin main`, then create a focused `feature/*`, `fix/*`, or `chore/*` branch.
2. Keep user-visible changes under `Unreleased` in `CHANGELOG.md` and use Conventional Commits.
3. Open a pull request that explains the behavior change, checks, linked issues, Firebase/security impact, and UI evidence where applicable.
4. Merge only after review, the quality workflow, and the browser suite pass. There is no preview deployment; review locally with the emulators.

## Publishing a release

Follow [the release guide](../docs/releasing.md). Production deploys are
owner-run with human Firebase OAuth; GitHub holds no Google or Firebase
credential. Release only an annotated tag from reviewed `main`, use the checked
in deployment script, and never move or reuse a published tag.
