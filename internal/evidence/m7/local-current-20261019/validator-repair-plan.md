# Evidence validator repair plan

The public seams are `validateEvidence` and its existing release-export and
deployment wrappers. The assigned repair is limited to the validator, its
governed-Skills regression tests and the validator evidence contract.

Inspected upstream authority:

- `.shpitto/contracts/validation-policy.json`: required check set, exact
  candidate digests, independent policy review and pinned validator source.
- `.shpitto/contracts/validation-evidence.json`: check identity, retained output
  and explicit reviewer identity/decision requirements.
- M7 acceptance criteria and common independent-review rules in
  `openspec/changes/restart-shpitto-video-saas/acceptance-gates.md`.
- `skills/security-review/SKILL.md`, `skills/modify-page/SKILL.md` and
  `docs/buyer/customization.md`: protected validator policy and retained evidence.
- `scripts/export-release.ts` and `scripts/deploy-release.ts`: both delegate to
  `validateEvidence`; no separate consumer relaxation is needed.

The contracts already require successful mandatory checks and an explicit
independent PASS. Runtime enforcement is missing, so wording alone cannot repair
the bypass. Add tests before each change, require the complete successful check
set from the policy next to the validator module, bind both candidate identities,
and require a named PASS reviewer distinct from the implementer. Add the missing
`implementerId` field to the evidence contract so independence can be checked
rather than accepted as a boolean assertion. Existing evidence without this
identity is intentionally incomplete and must be resubmitted rather than
grandfathered in. No accepted milestone record is rewritten.

Retain the original negative probe and failing test output. After repair, rerun
the fixed probe, consumer tests, type checking, source-boundary and formatting
checks. This bounded repair does not establish pinned-baseline provenance or
close the remaining disposable-customization and external milestone gates.

Independent review then identified two remaining malformed-metadata cases:
matching non-SHA-256 values and invalid timestamp/policy values. Additional red
tests were retained before enforcing 64-hex strings for both sides of each
digest, a parseable date string for `capturedAt`, and a canonical nonempty string
for `policyVersion`. No version allowlist was invented. The focused suite and
both export/deployment wrappers cover these cases.
