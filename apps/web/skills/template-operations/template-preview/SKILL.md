---
name: template-preview
description: Build and serve an isolated preview of a Shpitto template without changing production state.
---

# Template Preview

Run the template validation gate first. Materialize the current workspace into an isolated preview environment, use preview credentials only when explicitly enabled, and return the preview URL, build output, route checks, and changed-file snapshot.

Do not publish, mutate production CMS data, send live payment requests, or use production Provider credentials. Write `.shpitto/skill-result.json` before completion.
