# Releasing

Production releases are deployed from the owner's workstation with human
Firebase and Google Cloud authentication. GitHub validates tagged revisions and
publishes Releases, but it has no Google or Firebase deployment credential.

## Prepare the release

1. Merge the release changes into `main` through a reviewed pull request.
2. Update local `main` with `git pull --ff-only origin main`.
3. Confirm `package.json`, the visible footer version, and `CHANGELOG.md` use the
   same Semantic Version.
4. Run `npm run check` and the browser suite.
5. Create and push an annotated tag:

   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

Wait for the tag-triggered `release` workflow to pass. It verifies that the tag
points to `main`, runs the full test suites, and records checksums for the public
bundle, Firestore Rules, and Firestore indexes.

## Verify Firebase settings

Copy the template to the ignored `local/` directory:

```sh
cp docs/release-verification.example.json local/release-verification-vX.Y.Z.json
```

The checked-in template contains blocking placeholder values and is
intentionally invalid until every release check is completed.

Check the current Firebase and Google Cloud consoles, then complete the local
record with the release tag, its 40-character commit SHA, and the current time.
Confirm all of the following:

- The project is on the Spark plan and has no linked Cloud Billing account.
- The highest observed usage across Firestore, Hosting, Authentication, App
  Check, and Firebase AI Logic quotas is no more than 70%.
- App Check is configured correctly for both production hosts.
- The shipped model is `gemini-flash-lite-latest` and remains available without
  enabling billing.

The record must be less than 24 hours old. Keep it under `local/`; do not commit
console captures, account information, tokens, or the completed JSON file.

## Deploy and verify

Check out the exact tag and run the owner deployment command:

```sh
git checkout vX.Y.Z
npx --no-install firebase use
node scripts/release-deploy.mjs vX.Y.Z
```

The script requires successful validation for the exact tag, confirms the local
release record, checks pinned tooling and the active Firebase project, deploys
Firestore Rules and indexes, and compares the deployed configuration with the
tag. It then deploys both Hosting targets and byte-compares every public file on
both hosts.

After deployment, repeat the Spark, billing, and configuration checks when
prompted. The script writes a private manifest under `local/releases/` and
prints the exact `gh workflow run release.yml` command for publication.

## Publish

Run the command printed by the deployment script. The workflow rechecks the tag,
successful validation run, tagged hashes, and every live public file before it
creates or updates the GitHub Release.

If deployment or verification fails, fix the problem through a new branch and
pull request, then release a new Semantic Version. Never move or reuse a release
tag, and never use a raw production `firebase deploy` outside the reviewed
deployment script.
