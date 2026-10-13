# Provider worker bounded code review

Reviewers: independent native Codex agents Beauvoir (worker recovery review; then owned inbox repair) and Laplace (independent bootstrap/adoption follow-up). This is not an independent whole-M4 gate decision.

Findings and resolutions:

- HIGH: migrations ran before isolation checks. Fixed with unconditional preflight before constructing any migration client.
- HIGH: PostgreSQL query overrides and encoded socket hosts could change the effective connection target. Fixed with literal bounded private-DNS labels, explicit port/user/password/database and no query/hash; verified against the installed PostgreSQL parser and adversarial URL probes.
- HIGH: accepted POST identity could be lost before persistence. Fixed by provider-authenticated callback adoption bound to an issued nonce and durable start fence; identity replacement is rejected and deadlines/terminal state are preserved.
- MEDIUM: inbox acknowledgement lacked lease fencing/atomicity. Fixed by one outer transaction, account/task/lease lock order and exact inbox/attempt/workspace identity.
- MEDIUM: late terminal callbacks had no automatic drain. Fixed by a workspace-scoped terminal-only drain and quarantine without credit reopening.
- MEDIUM: same-origin result URLs could refer to another request. Fixed by exact request-path correlation, including documented dynamic tracking-path preservation.
- Runtime compatibility: ffprobe in the deployed Debian runtime identifies JPEG as image2. Fixed by checking both the allowed container and the actual decoded codec; forged PNG declarations remain rejected.

Verification: 145 focused contracts and 13 disposable PostgreSQL integration cases pass; fresh R2 input signing round trip passes; startup/restart and wrong-project rejection are observed in Railway. Worker remains paused and no paid create is performed. Narrow bootstrap/adoption review has no remaining identified target-isolation bypass. Full real-account M4 evidence and review remain open.
