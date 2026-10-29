# M6 current candidate development verification

Date: 2026-10-29T05:40:58.702Z
Candidate: `m6-current-20261029`
Source commit: `f59f1f094dab084374331de9ad2b7a6fb7ed081e`

On 2026-10-29T05:39Z the fixture-only local probes were rerun on disposable PostgreSQL. Operations, privileged, MFA, recovery, affiliate, affiliate database, affiliate races, cash affiliate, affiliate notifications, and affiliate referral passed. The referral probe recorded `realAccountVerified=false`. Logs: `internal/evidence/acceptance/local-rerun-20261029/`.

Real FirstPromoter account, campaign, hosted settlement, and independent whole-stage review were not re-run. No FirstPromoter write was made. The record remains `IN_PROGRESS`. Current M3 applicability is `STALE`. Historical M3 prerequisite evidence is unchanged.
