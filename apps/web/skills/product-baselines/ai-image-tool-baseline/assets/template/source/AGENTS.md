# Shpitto OpenCode Workspace Policy

This workspace is controlled by skill `template-validate` version `1.0.0`.

## Required execution order

1. Read `.shpitto/request.json`, `.shpitto/template-manifest.json`, `.shpitto/skill-manifest.json`, and the selected skill under `.opencode/skills/`.
2. Inspect the existing workspace before editing.
3. Keep changes within the declared mutation scopes and preserve the template manifest contract.
4. Run the declared validation commands when dependencies are available.
5. Write a JSON result to `.shpitto/skill-result.json` before finishing.

## Safety

- Never read, print, or copy secret values from environment files.
- Never edit `.git`, `node_modules`, parent directories, or files outside the workspace.
- Never claim deployment success without a deployment URL and smoke evidence.
- Never replace a real provider, CMS, billing, or persistence implementation with a mock unless the request explicitly selects test mode.
- Keep production mutation disabled in this workspace.

## Result contract

The result file must contain `status`, `skillId`, `changedFiles`, `checks`, `errors`, and a truthful summary.
