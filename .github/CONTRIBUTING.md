# Contributing

`AGENTS.md` is the canonical contributor guide for architecture, testing, health-content review, security, pull requests, and releases. Read it before changing the application.

## Change workflow

1. Update local `main` with `git pull --ff-only origin main`, then create a focused `feature/*`, `fix/*`, or `chore/*` branch.
2. Keep user-visible changes under `Unreleased` in `CHANGELOG.md` and use Conventional Commits.
3. Open a pull request that explains the behavior change, checks, linked issues, Firebase/security impact, and UI evidence where applicable.
4. Merge only after review, the quality workflow, and the browser suite pass. There is no preview deployment; review locally with the emulators.

## Publishing a release

GitHub holds no Google/Firebase credential; production deploys are owner-run
with human Firebase OAuth.

1. Prepare the next Semantic Version through a reviewed release-finalization pull request. Promote the changelog section and update every package and visible version reference.
2. Update local `main`, confirm it is green, create an annotated `vX.Y.Z` tag on the release commit, and push the tag. Never tag or deploy from a topic branch. Wait for the tag-triggered gate workflow to pass; it reruns all checks with zero cloud credentials and records tagged bundle/Rules/index hashes.
3. Complete `docs/capacity-model.md`, copy `docs/release-preflight.example.json` to `local/release-preflight-vX.Y.Z.json`, and record fresh Spark/no-billing, quota, AI/App Check, WIF-host, and 30%-reserve evidence.
4. Check out the exact tag and run `node scripts/release-deploy.mjs vX.Y.Z` (requires locally authenticated `gh`, `firebase`, and `gcloud` CLIs). The script independently requires that exact gate and preflight, verifies tagged Rules/indexes before Hosting, compares every live byte, requires a repeated Spark/config confirmation, and writes `docs/releases/vX.Y.Z-evidence.json`.
5. Run the exact hand-triggered publish command printed by the script. It re-verifies provenance, the gate-run ID, tagged hashes, and every public live byte, then creates `Diet Tracker vX.Y.Z` in GitHub Releases and marks it Latest.
6. Confirm the production deployment, GitHub Release entry, and both live sites are green. Never substitute a lightweight tag, moved tag, reused version, or a raw `firebase deploy` against production outside the reviewed script.

The GitHub Release publication step is safe to rerun: an existing entry is published and marked Latest instead of duplicated. If only that metadata step fails after a verified deployment, rerun the workflow or attach the missing Release entry to the existing annotated tag.
