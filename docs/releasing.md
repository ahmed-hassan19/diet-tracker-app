# Releasing

Production releases are deployed from the owner's workstation with human
Firebase and Google Cloud authentication. GitHub validates tagged revisions and
publishes Releases, but it has no Google or Firebase deployment credential.

## Prepare the release

1. Merge the release changes into `main` through a reviewed pull request.
2. Update local `main` with `git pull --ff-only origin main`.
3. Set the new version in `package.json`, its two root `package-lock.json`
   copies, `APP_VERSION` in `public/data.js`, and a dated `CHANGELOG.md` section.
   The footer reads the checked runtime copy and must not hard-code a version.
4. Run `npm run check`, the browser suite, and
   `node scripts/version-contract.mjs --tag vX.Y.Z`.
5. Create and push an annotated tag:

   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

Wait for the tag-triggered `release` workflow to pass. It verifies that the tag
points to `main`, applies the same version contract used by contributor checks
and the deployment script, runs the full test suites, verifies every pinned
Firebase browser SDK resource, and records checksums for the public bundle,
Firestore Rules, Firestore indexes, runtime-resource manifest, and complete
Hosting header configuration.

## Verify Firebase settings

Copy the template to the ignored `local/` directory:

```sh
cp docs/release-verification.example.json local/release-verification-vX.Y.Z.json
```

The checked-in schema 5 template represents an AI-disabled client after the
Firebase AI controls have been hardened, with an invalid-App-Check response of
`401` still blocking enablement. It contains blocking identity, time, control,
test, and quota-inventory placeholders and is intentionally invalid until the
current checks are completed. The release validator reads `window.AI_ENABLED`
from the exact tagged `public/index.html` bytes and rejects a record whose stage
disagrees; the record cannot choose its own enabled or disabled validation path.
Within a disabled stage, `configurationState` explicitly selects either the
preconfiguration contract or the hardened-disabled contract.

Check the current Firebase and Google Cloud consoles, then complete the local
record with the release tag, its 40-character commit SHA, and the current time.
Every stage must confirm all of the following:

- The project is on the Spark plan and has no linked Cloud Billing account.
- The highest observed usage across Firestore, Hosting, Authentication, App
  Check, and Firebase AI Logic quotas is no more than 70%.
- The record names both exact production hosts and confirms Firestore App Check
  enforcement.
- The shipped model is exactly `gemini-3.5-flash-lite` and remains stable and
  available without enabling billing. Record the current model backend RPM,
  RPD, input TPM, and input TPD rows and Firebase AI Logic telemetry mode.
- The Google-managed Firebase AI Logic P4SA and its
  `roles/firebaseml.serviceAgent` role are present. No Gemini Developer API key
  is embedded, any service-managed Gemini key stays server-side and obfuscated,
  the public browser key does not allow the Generative Language API, and any
  obsolete Gemini key has no recent consumers before removal.
- The `_Default` bucket retains logs for 30 days, aggregate metrics remain
  available, and no export sink exists.
- The enablement-target section keeps the exact model, hosts, App Check and Auth
  requirements, 6 RPM/user target, log filter, and required spot checks.

For an AI-disabled tag whose controls have not yet been configured, use
`stage: "ai-disabled-rollout"` and
`configurationState: "disabled-preconfiguration"`. Record the observed
preconfiguration baseline without claiming later success:

- Firebase AI Logic App Check and authenticated-users mode are off; the Auth,
  `401`, `403`, both-host, and model spot-check fields remain false or empty.
- Under `generateContentRpmPerUserQuota`, use only metric
  `firebasevertexai.googleapis.com/generate_content_requests_per_minute_per_project_per_user`
  and quota ID `GenerateContentRequestsPerMinutePerProjectPerUser`. Normalize
  all 39 current `dimensionsInfos` entries into 38 named-region entries with an
  empty `applicableLocations` array plus the one grouped entry with
  `region: null`; every observed limit must be 100. The 38 names and the grouped
  five-location set must exactly match the canonical arrays in
  `aiEnablementTargets`; invented, missing, renamed, or newly reported regions
  fail validation and require a reviewed schema update. Never substitute the
  Bidi metric or collapse the applicable locations into a pseudo-scope.
- The Model log exclusion resource and existing-log expiry remain unset in the
  observed section: `exclusionDisabled`, `exclusionFilter`,
  `exclusionCreatedAt`, `exclusionUpdatedAt`, `exclusionVerifiedAt`, and
  `existingModelLogsExpireAt` are all `null`. The exact exclusion belongs in
  the planned-target section only.

This baseline record is sufficient to deploy 3.7.0. Do not configure the
post-deployment AI controls before its compatible client bytes are live.

Release 3.7.0 keeps `window.AI_ENABLED=false` even after the same-app bridge is
deployed. Only then configure and verify authenticated-users mode, all 39
6 RPM/user location buckets, the exact log exclusion, and AI App Check
enforcement. Run authenticated success, unauthenticated `401`, invalid-App-Check
`403`, calorie-reference, and latency checks from localhost with a temporary
registered debug token and from both production hosts. A session-only owner
override may exercise the exact deployed 3.7.0 bridge while the shipped flag
remains false; never store the debug token or override in the release record.

If those controls have been configured but AI must remain disabled because an
invalid App Check request returned `401` instead of the required `403`, keep
`stage: "ai-disabled-rollout"` and use
`configurationState: "disabled-hardened-invalid-app-check-401"`. This contract
requires current evidence for Firestore and Firebase AI Logic App Check,
authenticated-users mode, authenticated success, unauthenticated `401`, both
production hosts, localhost debug-token access, calorie-reference and latency
checks, the exact current Model log exclusion resource, and its derived 30-day
older-log expiry.
It also requires the exact non-Bidi Generate Content quota metric and all 39
location buckets at 6 RPM/user, plus the Spark-plan reserve, model availability,
P4SA, key restrictions, and telemetry checks shared by every stage. Record
`invalidAppCheckObservedHttpStatus: 401` and keep
`invalidAppCheck403Verified: false`; a `403` success claim is contradictory and
fails validation. The checked-in template uses this state but leaves completion
evidence false, empty, or null until it is verified.

For an AI-enabled tag such as 3.7.1, use `stage: "ai-enabled-rollout"`, replace
the observed baseline with the hardened current posture, set
`configurationState: "enabled"`, record all 39 exact location buckets at 6, the
exact current log exclusion resource and older-log expiry, and current
completion times for every
spot check. Enabled releases continue to require
`invalidAppCheck403Verified: true` together with
`invalidAppCheckObservedHttpStatus: 403`; a missing status or an observed `401`
fails validation. The deploy script rejects an enabled tagged client until all
of that evidence is present. If any check fails, leave AI disabled; another
model, a paid tier, and automatic billing are never fallbacks.

Read the current Cloud Logging
[`LogExclusion` resource](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/exclusions)
and record its exact `filter` and `disabled` value together with its authoritative
`createTime` and `updateTime`. Store those times as canonical UTC
`exclusionCreatedAt` and `exclusionUpdatedAt`, add the canonical current time at
which the resource was inspected as `exclusionVerifiedAt`, and require
`created <= updated <= verified`. The exclusion must be enabled
(`exclusionDisabled: false`), and verification must be no more than 24 hours old
and no later than the release record's `verifiedAt`. Set
`existingModelLogsExpireAt` to exactly 30 days after `exclusionUpdatedAt`. This
is the conservative deadline for Model bodies ingested immediately before the
latest exclusion configuration under the `_Default` retention. The deadline may
already have passed; it remains useful historical evidence. If the resource is
edited, advance the recorded update time and derived expiry. Missing,
noncanonical, future-dated, stale, or inconsistent evidence fails validation.

App Check and authenticated-users mode are console actions, never repository
claims. Preserve the compatible client-before-enforcement ordering, test
member/non-member/revoked and 401/403/429/offline recovery, and repeat both-host
verification after deployment. Automated browser tests stub or disable AI and
must never call production.

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
both hosts. It also fetches all five Firebase SDK URLs and rejects changed
bytes, undeclared imports, or version drift. Finally it verifies the exact CSP
and security headers, including `no-store`, on `/`, HTML, JavaScript, the privacy
page, and a rewritten missing path on both hosts.

Because local browser tests bypass App Check, also open each production host in
a clean signed-in session and confirm that the reCAPTCHA/App Check bootstrap,
Google sign-in, tracker read, and a permitted tracker write complete without a
CSP violation before publication. This is a read/write smoke check against the
already-deployed tagged client, not permission to change Firebase configuration.

After deployment, repeat the Spark, billing, and configuration checks when
prompted. The script writes a private manifest under `local/releases/` and
prints the exact `gh workflow run release.yml` command for publication. The
command includes the runtime-resource and Hosting-header hashes from the tagged
revision; do not calculate or substitute them manually.

## Publish

Run the command printed by the deployment script. The workflow rechecks the tag,
successful validation run, all tagged hashes, every live runtime dependency,
both hosts' response headers, and every live public file before it creates or
updates the GitHub Release.

If deployment or verification fails, fix the problem through a new branch and
pull request, then release a new Semantic Version. Never move or reuse a release
tag, and never use a raw production `firebase deploy` outside the reviewed
deployment script.
