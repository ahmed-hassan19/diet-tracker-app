# Releasing

Production releases are deployed from the owner's workstation with human
Firebase and Google Cloud authentication. GitHub validates tagged revisions,
publishes Releases, and records verified production deployment metadata, but it
has no Google or Firebase deployment credential.

## Prepare the release

1. Merge changes through focused, reviewed pull requests, keeping documentation
   and verification changes separate from the food-history fix. Leave published
   v3.15.0 unchanged; the next planned patch is v3.15.1.
2. Prepare version changes on a focused branch: update `package.json`, its two
   root `package-lock.json` copies, `APP_VERSION` in `public/data.js`, and a dated
   `CHANGELOG.md` section. The footer reads the checked runtime version.
3. Run affected tests while editing and `npm run check:static` before committing.
   `npm run check` remains the full static/unit/Firestore-rules gate. CI runs it
   and the browser suite on PRs and pushes to `main`; ordinary topic-branch pushes
   and tag pushes do not repeat the quality suite.
4. Merge the reviewed version PR, update local `main` with
   `git pull --ff-only origin main`, and wait for successful quality on that exact
   main commit. Desktop runs the complete browser suite; mobile retains RTL and
   responsive layouts, setup, custom entries/import-export, suggestions, chart
   touch/dismissal, deletion, and destructive confirmations. Viewport-independent
   migration and request-only checks remain covered on desktop. Playwright stays
   serialized with zero-console-error assertions.
5. Run `node scripts/version-contract.mjs --tag vX.Y.Z`, then create and push an
   annotated tag:

   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

Wait for the tag-triggered `release` workflow. It requires the tag to point to
current `origin/main`, validates the version contract and pinned Firebase SDK
resources, and records bundle, Rules, indexes, runtime-resource, and Hosting-header
checksums. It reuses quality only for the exact tagged SHA, correct repository
and quality workflow, `push` event, `main` branch, and completed successful run.
Missing evidence blocks release; a PR run or a successful neighboring commit does
not qualify. The owner deployment script also checks this evidence.

## Complete release evidence

Copy the intentionally incomplete schema 7 template into the ignored directory:

```sh
cp docs/release-verification.example.json local/release-verification-vX.Y.Z.json
```

The first v3.15.1 schema 7 release changes the verification policy and food-history
security rules, so it requires fresh qualification. The 30-day reuse window begins
with that completed audit; existing schema 6 evidence is not reusable.

Published tags retain the validators in their immutable tagged source. Schema 7
separates fresh release evidence from reusable qualification; it does not upgrade
old records by changing their schema number or refreshing their timestamps.

Fresh evidence is valid for at most 24 hours and records the exact release tag,
commit, both production hosts, and the current inspection time. Check Firebase
and Google Cloud configuration for every release:

- Spark plan, no linked Cloud Billing account, and at most 70% observed quota
  usage across Firestore, Hosting, Authentication, App Check, and Firebase AI Logic.
- Firestore and Firebase AI Logic App Check enforcement, authenticated-users mode,
  and the current model's availability without billing. The accepted moving alias
  is `gemini-flash-lite-latest`; record its resolved target when known, or `null`
  when unresolved. An unresolved target must not be described as unchanged.
- The Google-managed Firebase AI Logic P4SA and
  `roles/firebaseml.serviceAgent`; no embedded Gemini Developer API key; the
  service-managed key remains server-side and obfuscated; the public browser key
  does not allow Generative Language API; obsolete keys have no recent consumers.
- The exact Generate Content per-project/per-user metric and quota ID, all 38
  named regions plus the grouped five-location bucket, and a limit of 6 in every
  bucket for hardened/enabled releases. Never substitute the similarly named Bidi
  metric. A changed inventory requires a reviewed validator/template update.
- Firebase AI Logic telemetry mode `NONE`, the current free-tier quota rows, the
  exact enabled Model log-body exclusion, `_Default` retention of 30 days, retained
  aggregate metrics, and no export sink.

Record the current log exclusion resource's exact filter, `disabled: false`, and
canonical `createTime`/`updateTime` as `exclusionCreatedAt`/`exclusionUpdatedAt`.
Set `exclusionVerifiedAt` to the actual inspection time, within 24 hours and no
later than the release `verifiedAt`, with `created <= updated <= verified`.
`existingModelLogsExpireAt` is exactly update time plus 30 days; this historical
expiry may already have passed. Never advance the resource timestamps to make
old evidence appear fresh.

The validator derives `window.AI_ENABLED` from the exact tagged `index.html`;
the record cannot select a different stage. Enabled tags use
`stage: "ai-enabled-rollout"` and `configurationState: "enabled"`. A future
hardened-disabled tag uses `stage: "ai-disabled-rollout"` and
`configurationState: "disabled-hardened-invalid-app-check-rejected"` while
retaining the hardened controls and qualification. AI failure requires manual
entry or a reviewed fix-forward release; paid tiers, weaker Auth/App Check,
automatic billing, and fallback models are not permitted.

### Reusable qualification

A full audit is reusable for at most 30 days from its original `qualification.auditedAt`.
Retain its original audited `commitSha`, configuration hash, input hash, alias
target, probe results, and spot-check completion time. Qualification includes:

- One paired probe in the same authenticated session: a valid-App-Check control
  succeeds, and an otherwise equivalent invalid-App-Check request returns `401`
  or `403` without model output.
- A genuinely unauthenticated request returning exactly `401`.
- Registered localhost debug-token verification, calorie-reference checks,
  latency comparison, and the original both-host spot checks.

The deployment script computes configuration and code comparisons; self-reported
"unchanged" is insufficient. Use the helper to inspect the audited-to-release
comparison:

```sh
node scripts/qualification-inputs.mjs AUDITED_COMMIT_SHA RELEASE_COMMIT_SHA
```

The audited commit must be an ancestor of the release. Every intervening commit
is compared, including changes later reverted. AI/Auth/App Check behavior,
Firebase SDKs, security configuration, model selection, and the verification
policy are qualification inputs. Unrelated diet/UI edits do not invalidate an
otherwise matching audit. The comparison hashes executable application code except an explicit allowlist of
existing diet/UI functions, plus configuration/policy files. New functions,
top-level code, shared persistence/session changes, and code outside that
allowlist conservatively require fresh qualification; update the scope when
responsibilities move.
Record `qualificationDiffReview` with `auditedCommitSha`, `releaseCommitSha`,
`reviewedAt`, and `noRelevantBehaviorChanges: true` only after inspecting the exact
intervening diff, including allowed diet/UI bodies. This owner review must be
within 24 hours and confirm no relevant AI, Auth, App Check, or security behavior
changes. Matching computed inputs alone is not semantic proof. All five classic
scripts are inspected; known nutrition literals and pure diet functions can be
excluded. A function with sensitive references is bound in full, including its
control flow; new executable code also remains bound.

The configuration hash is computed by `qualificationConfigurationHash()` in
`scripts/release-lib.mjs` from the recorded inspected configuration.

Relevant changes, a detected alias-target change, a failed probe or smoke check,
or audit expiry require fresh qualification. `qualificationFailureDetected` must
truthfully record detected failure; setting it false cannot substitute for
investigation and a passing audit. Keep unresolved alias targets `null` rather
than claiming stability. Do not copy current dates onto reused probes.

### Historical rollout records

The `disabled-preconfiguration` posture describes the historical AI-disabled
rollout, with unenforced AI controls, 100 RPM/user quota buckets, null exclusion
resource fields, and no claimed successful probes. Release 3.7.0 used schema 4;
later immutable tags used their own schema 5 or 6 contracts. These records document
past deployment ordering and are not evidence that today's enabled release is
qualified. Beta membership checks and membership polling were removed in v3.15.0.
Automated browser tests stub or disable AI and must never call production.

## Deploy and verify

Check out the exact tag and run the owner deployment command:

```sh
git checkout vX.Y.Z
npx --no-install firebase use
node scripts/release-deploy.mjs vX.Y.Z
```

The script requires successful exact-tag validation and exact-main quality,
validates the private evidence, checks pinned tooling and active project identity,
deploys Rules/indexes, and compares their deployed configuration with the tag.
It deploys both Hosting targets and byte-compares every public file. It fetches
all pinned Firebase SDK resources and rejects changed bytes, undeclared imports,
or version drift. It also checks exact CSP/security/cache headers, including
`no-store`, on both hosts' root, HTML, JavaScript, privacy page, and rewritten paths.

After the bytes match, perform a fresh smoke test on each production host using
the dedicated test account: App Check bootstrap, Google sign-in, own tracker
read/write, one generic-food AI draft followed by cancellation without saving,
and zero console/CSP errors. Restore the test account's changes and sign out
on both hosts. This scoped smoke does not authorize configuration changes.

Repeat the Spark, billing, and current configuration inspection when prompted.
Update the private record with the actual fresh `verifiedAt` and
`postDeployment.completedAt`, and both hosts' passing results for `bootstrap`,
`signIn`, `ownDataRead`, `ownDataWrite`, `aiDraftCancelled`, `consoleClean`,
`testDataRestored`, and `signedOut`. Preserve the original qualification block
when reusing it. The script rereads and validates the post-deployment record;
missing, stale, or failed smoke blocks publication. Keep `postDeployment: null`
until the real deployed smoke is complete.

The script writes a private manifest under `local/releases/` and prints the exact
`gh workflow run release.yml` publication command, including tagged hashes. Do
not substitute hashes manually. Never commit completed evidence, exported data,
account identifiers, tokens, prompts, console captures, or raw logs.

## Publish

Run the printed command. Publication rechecks tag provenance, successful tag
validation, hashes, runtime dependencies, headers, and every live public byte.
This repeat byte verification detects drift after the initial deployment check
and remains required. Only then does the workflow publish the GitHub Release
and idempotently record the exact commit as a successful GitHub `production`
deployment; it holds no Firebase credential and does not deploy.

If deployment or verification fails, fix forward through a reviewed branch and
new SemVer tag. Never move or reuse published tags or run raw production
`firebase deploy` outside the owner procedure.
