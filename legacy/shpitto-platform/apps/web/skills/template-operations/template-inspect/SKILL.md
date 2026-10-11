---
name: template-inspect
description: Inspect a Shpitto template workspace and report its manifest, capabilities, routes, integrations, and current runtime state without mutation.
---

# Template Inspect

Read `AGENTS.md` and every file under `.shpitto/` before inspecting the application. Read the selected template manifest, skill manifest, route contract, package manifest, CMS schema, environment example, migrations, and deployment configuration.

Do not mutate application files, install dependencies, call production services, or read secret values. Report the current template id/version, declared capabilities, missing capabilities, routes, integrations, validation status, and a truthful machine-readable result at `.shpitto/skill-result.json`.
