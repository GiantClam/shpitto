# Current M4 recovery drill

Date: 2026-10-16. Profile: selected self-hosted Railway demo.

The retained recovery probe used a fresh fixture workspace/database and a fake clock. It did not create a provider request and did not inspect or delete existing business objects. It found 102 overdue tasks, failed all 102, released all 102 reservations, preserved the submission fence, restored the seeded demo credit balance, and verified the heartbeat, alert delivery and incident correlation assertions.

Sanitized evidence: `recovery-drill-20261016.json`.

This evidence proves the selected recovery controller and monitoring path. It does not claim provider invoice cost, production email, Stripe settlement, Trigger.dev execution or customer release readiness.