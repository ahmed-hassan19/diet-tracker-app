# Gate 0 evidence checklist (owner-run, manual)

Static checks in `scripts/spark-guard.mjs` cannot prove billing state or console
configuration. Before any production mutation, capture each item below and
record the date. Store captures (screenshots, exports) outside the repository;
this file only records what was captured and when. Never paste tokens,
account lists, or health data here.

## 1. Spark plan and no linked billing (blocks everything)

- [ ] Firebase console → project `diet-tracker-372ca` → Usage and billing:
      plan says **Spark** and no Cloud Billing account is linked.
- [ ] If Blaze is active instead: stop. Inventory what would stop, decide the
      downgrade/unlink deliberately, reverify. Never change billing automatically.
- Captured: ____________

## 2. Quota snapshots

- [ ] Firestore usage/storage baseline (reads, writes, deletes, GiB) from the
      console, against the current documented free allowance.
- [ ] Combined Hosting storage/transfer for both sites.
- [ ] Auth active-user count.
- [ ] App Check assessment usage.
- [ ] Gemini API quota rows: Generate Content RPM/RPD/TPM/TPD for every region
      in use; set Generate Content to exactly **6 RPM per user** where applicable.
      Record before/after rows whenever quotas change.
- Captured: ____________

## 3. AI posture (needed again at Release A1)

- [ ] Registered web App Check app IDs inventoried (code currently ships one
      `appId` used on both hostnames); valid reCAPTCHA v3 tokens confirmed for
      every app ID and both production hosts.
- [ ] Firebase AI Logic P4SA/service agent exists; no embedded Gemini API key;
      public Firebase API key does not allowlist the Generative Language API;
      obsolete Firebase-created Gemini key has zero recent consumers (then removed).
- [ ] Existing Firebase AI Logic Model logs inspected; bucket retention/expiry
      recorded. The `_Default` exclusion added later is not retroactive.
- Captured: ____________

## 4. Deploy credential teardown (after this branch merges)

GitHub no longer authenticates to Google: `release.yml` holds no WIF/auth step
and `preview.yml` is deleted. Finish removing the now-unused access:

- [ ] No other consumer of the Workload Identity provider exists → delete the
      provider and the deploy service account plus its role bindings.
- [ ] Remove `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT`
      GitHub variables and any related secrets/environments.
- [ ] Expire existing Hosting preview channels and old Hosting versions
      (`firebase hosting:channel:delete <channel>` per channel); do not touch the
      two production sites.
- Captured: ____________

## Release preflight reminder

Repeat before every tag: Spark/no-billing still true, capacity reserve intact,
exact pinned model unchanged, Rules compatibility verified via
`scripts/release-deploy.mjs`, bundle hash matches the gate artifact.
