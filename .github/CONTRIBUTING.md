# Contributing

`AGENTS.md` is the canonical contributor guide for architecture, testing, health-content review, security, pull requests, and releases. Read it before changing the application.

## Change workflow

1. Update local `main` with `git pull --ff-only origin main`, then create a focused `feature/*`, `fix/*`, or `chore/*` branch.
2. Keep user-visible changes under `Unreleased` in `CHANGELOG.md` and use Conventional Commits.
3. Open a pull request that explains the behavior change, checks, linked issues, Firebase/security impact, and UI evidence where applicable.
4. Merge only after review, the quality and browser suites, and the Firebase preview succeed.

## Publishing a release

1. Prepare the next Semantic Version through a reviewed release-finalization pull request. Promote the changelog section and update every package and visible version reference.
2. Update local `main`, confirm it is green, create an annotated `vX.Y.Z` tag on the release commit, and push the tag. Never tag or deploy from a topic branch.
3. The tag-triggered workflow reruns all checks, deploys both Firebase Hosting targets, and byte-compares every live public file with the tagged source.
4. After production verification succeeds, the workflow creates `Diet Tracker vX.Y.Z` in GitHub Releases, generates notes from the previous Latest release, and marks the new entry Latest.
5. Confirm the release workflow, production deployment, GitHub Release entry, and both live sites are green. Do not substitute a manual Firebase deploy, lightweight tag, moved tag, or reused version.

The GitHub Release publication step is safe to rerun: an existing entry is published and marked Latest instead of duplicated. If only that metadata step fails after a verified deployment, rerun the workflow or attach the missing Release entry to the existing annotated tag.
