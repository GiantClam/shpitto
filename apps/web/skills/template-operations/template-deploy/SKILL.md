---
name: template-deploy
description: Deploy a validated Shpitto template through an explicit environment and deployment adapter with rollback evidence.
---

# Template Deploy

Require an explicit target and environment. Run validation and preview checks before deployment, verify required server capabilities are compatible with the target, and record deployment id, URL, smoke results, audit id, and rollback command.

Never deploy a server-capable template through a static-only bundler. Never infer production approval from a chat message without the platform policy gate. Write `.shpitto/skill-result.json` with truthful deployment evidence.
