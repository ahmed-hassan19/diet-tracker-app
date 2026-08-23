# Capacity model (Spark, cooperative beta)

Working sheet for the plan's cost invariant: model supported cooperative flows
at or below **70% of every current quota**, leaving 30% operating reserve. Fill
each row from the official console/docs at review time — never from remembered
numbers. Stop invitations or optional work before modeled usage crosses the
reserve. Spark prevents charges, not denial of service; public Hosting/Auth/App
Check endpoints, multiple accounts, and AI traffic can still exhaust
availability. That residual risk is availability-only, never cost.

## Quota rows (replace with current console values each release)

| Resource | Documented free allowance | 70% ceiling | Modeled use | Measured delta |
|---|---|---|---|---|
| Firestore storage | 1 GiB | | | |
| Firestore reads/day | 50,000 | | | |
| Firestore writes/day | 20,000 | | | |
| Firestore deletes/day | 20,000 | | | |
| Hosting storage (both sites) | | | | |
| Hosting transfer/month | | | | |
| Auth active users | | | | |
| App Check assessments | | | | |
| Gemini Generate Content RPM/user | 6 (configured) | | | |
| Gemini RPD / TPM / TPD per region | fill from console | | | |

Include Rules-dependent reads from rejected requests in the Firestore row.
Capture before/after production usage deltas for every release in the last
column.

## Pessimistic read budget (per operation)

“Dependent” means Rules `get`/`exists`/`getAfter`; no cache or deduplication is
assumed. Replace estimates with emulator Rules-debug evidence and measured
deltas as they arrive.

| Operation/path | Explicit client reads | Dependent-read ceiling | Read ceiling |
|---|---:|---:|---:|
| Bootstrap or listener reconnect | 3 (member, control, tracker) | 0 | 3 |
| Accepted normal flush | 1 (control transaction) | 2 (member, control) | 3 |
| First v2 claim | 3 (member, control, tracker) | 4 (both atomic post-images) | 7 |
| Replacement import | 3 (member, control, tracker) | 4 (both atomic post-images) | 7 |
| Begin deletion | 1 (control) | 0 | 1 |
| Delete tracker | 0 | 1 (control) | 1 |
| Finalize deletion | 2 (control, tracker) | 1 (`existsAfter`) | 3 |
| Start fresh | 3 (member, control, tracker) | 4 (both atomic post-images) | 7 |
| Supported stale-epoch flush abort | 1 (control) | 0 | 1 |
| Crafted rejected member write | 0 | 2 (member, control) | 2 |
| Crafted rejected nonmember write | 0 | 1 (member) | 1 |

## Daily cooperative model (fill when the invited-user count is set)

- Invited users: ____ · active/day assumption: ____
- Flushes per active user/day: ____ → reads ____ writes ____
- Bootstraps/reconnects per device/day: ____ → reads ____
- Imports/deletes/start-fresh events/month: ____
- AI estimates per user/day: ____ (manual entry remains the default path)
- Totals vs ceilings above; reserve margin remaining: ____%

## Free-quota failure behavior (product contract)

- Firestore unavailable/exhausted: local use and export keep working; bounded
  exponential backoff stops retry storms; dirty changes preserved; Arabic
  cloud-sync warning shown.
- Auth unavailable/exhausted: sign-in marked unavailable; no paid provider.
- Hosting exhausted: both hosts may stay unavailable until reset; no paid CDN.
- AI/App Check exhausted: retry-later plus manual calorie entry remain.
- No message or recovery action may suggest enabling billing.
