# Provider operations

Provider health is derived from persisted observations and bounded recovery ages. A provider marked degraded affects generation capability only; authentication, workspace history and billing visibility remain available.

- Unknown provider submissions alert at 30 minutes and expire at the accepted recovery deadline.
- Outbox lag over five minutes indicates scheduling pressure; it does not authorize a second paid create.
- A recovery sweep heartbeat older than three minutes requires restarting the worker and allowing the fenced lease to expire.
- Metrics contain workspace/task/attempt correlation and status only. Never copy provider bodies, signed URLs, prompts or credentials into logs.

All remediation must call generation domain commands (`reconcileSubmissionUnknown`, `settleGenerationTask`, or the materialization command). Direct balance or task-row edits are prohibited.
