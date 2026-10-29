# Independent root dependency evolution review

Date: 2026-10-15. Reviewer: native Codex subagent Bacon, `01a13edc-af8a-70e0-8081-41fbe84ac2df`. Independent from implementer: true. Final decision: PASS for the root-baseline scope only; no M4 whole-stage approval.

The reviewer independently reran all 22 root-integrity/candidate-footprint tests and the root checker. Historical proof, the exact application lock and normalized workspace configuration match their historical/adoption anchors. Only the two documented direct-dependency differences are permitted; development dependencies remain unchanged. The evolution decision and registry are included in canonical invalidation footprints and the regressions run in `verify:root`.

The first implementation review found a P2 bypass: `pnpm-workspace.yaml` could change dependency overrides or add package extensions while retaining `packages: []`. The implementer reproduced both cases as failing rejection tests before adding the complete workspace hash. A second boundary test caught `bundledDependencies: true` being treated as an absent section; the checker now requires matching field presence before comparing content. The final review confirmed these fixes with 22 focused tests and 42 additional alternate-section probes. LF/CRLF variants still pass. These findings are resolved, not suppressed.

The separate policy/design reviewer Nietzsche, `01a13ec8-67b2-73c0-9c92-4655ee87fd13`, accepted the bounded replacement in principle under REQ-FND-03, subject to full dependency maps, alternate-section rejection, portable historical text anchors, exact locks, canonical digest coverage and independent implementation verification. These conditions are implemented and covered by the final review.

The reviewers made no repository edits, installs, network calls or paid submissions. Current compatibility/build/frozen-lock/audit evidence is retained in this directory. Future dependency or workspace-policy changes need a separately reviewed decision; this approval cannot be reused to approve arbitrary rebaselining.
