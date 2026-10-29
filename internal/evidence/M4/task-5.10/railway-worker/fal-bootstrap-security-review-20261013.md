# One-shot Fal bootstrap security review

Date: 2026-10-13. Independent native Codex reviewer: Carver.

Verdict: no HIGH or CRITICAL blocker for the controlled isolated one-shot, including same-command Railway project/service/profile checks and an ignored local backup of the receipt before restarts. Reviewer performed no cloud calls and did not inspect secret values. 44 offline contract cases passed.

Verified: durable pre-POST at-most-once fencing, no transport retries, exact persisted request-ID/account-signature correlation, unchanged default account-binding create guard, fixed 720p/81-frame/16-FPS input and authenticated USD1 reference-price ceiling, fresh-workspace scoping and sanitized outputs.

Medium observations: receipt-only recovery after an interrupted local-to-database record needs a fenced no-POST recovery path; a local POST counter is not provider billing proof. The probe now distinguishes unavailable counters from zero and labels local token-verifier checks separately from real HTTP downloads. Actual cost remains UNKNOWN unless provider billing independently confirms it. No exactly-once completion or full M4 acceptance is claimed.
