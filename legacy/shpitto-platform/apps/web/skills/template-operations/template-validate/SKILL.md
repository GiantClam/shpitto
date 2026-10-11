---
name: template-validate
description: Validate a Shpitto template workspace before preview or deployment.
---

# Template Validate

Validate the manifest, route ownership, generated workspace build, server routes, environment boundary, CMS schema, migrations, provider configuration, payment webhook signature path, entitlement idempotency, and deployment target.

Do not claim a capability from a metadata field alone. A check passes only when the relevant code path or sandbox test provides evidence. Write all checks, blockers, and remaining risks to `.shpitto/skill-result.json`.
