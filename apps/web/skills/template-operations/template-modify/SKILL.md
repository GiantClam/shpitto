---
name: template-modify
description: Apply a bounded natural-language modification to an existing Shpitto template while preserving its manifest and product runtime contracts.
---

# Template Modify

Inspect the current workspace and classify the request as content, visual, routes, template-runtime, CMS, billing, provider, or deployment scope. Read the product baseline skill and all relevant template contracts before editing.

Preserve authentication, generation, history, billing, CMS, and deployment behavior unless the request explicitly changes that contract. Never replace a real integration with a mock. Keep changes within the declared mutation scopes, run validation, record changed files and rollback information, and write `.shpitto/skill-result.json`.
