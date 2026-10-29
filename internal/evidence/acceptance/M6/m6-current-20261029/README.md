# M6 current candidate development verification

Date: 2026-10-29T05:40:58.702Z
Candidate: `m6-current-20261029`
Current candidate commit: `0927667df20a799de4b2fefaadbf7a833f49cbce`

On 2026-10-29T05:39Z the fixture-only local probes were rerun on disposable PostgreSQL. Operations, privileged, MFA, recovery, affiliate, affiliate database, affiliate races, cash affiliate, affiliate notifications, and affiliate referral passed. The referral probe recorded `realAccountVerified=false`. Logs: `internal/evidence/acceptance/local-rerun-20261029/`.

An aipc disposable Docker PostgreSQL 16 fixture rerun on `127.0.0.1:55432` is archived at `internal/evidence/acceptance/aipc-local-55432-20261029/`. Recovery, affiliate contracts, affiliate database, refund preview, admin reads, notifications, races, referral, cash affiliate, operations, privileged, workspace details, and two-factor exited 0. Affiliate scope is `local-pure-contracts-only` with `databaseVerified=false` and `providerVerified=false`. Referral and the affiliate-database probe record `realAccountVerified=false`. Two-factor stdout records `externalAccountsUsed=false` and is absent from the aggregate `m6` list.

Real FirstPromoter account, campaign, hosted settlement, and independent whole-stage review were not re-run. No FirstPromoter write was made. The candidate digest was refreshed after integrating the Corepack CI bootstrap and reviewed Nodemailer dependency baseline. Root dependency integrity and 22 root-integrity/candidate-digest regression tests pass; this is baseline evidence only and does not rerun or promote M6. The record remains `IN_PROGRESS`. Current M3 applicability is `STALE`. Historical M3 prerequisite evidence is unchanged.
