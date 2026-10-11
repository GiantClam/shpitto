# Independent workspace-detail review

Review date: 2026-10-04. Source was frozen by the admin implementation owner
before final review. This reviewer did not implement the detail query, route,
component, or dedicated probe.

**PASS for the reviewed local slice. No blocking finding remains.**

Reviewed files:

- `src/modules/operations/workspace-details.ts`
- `src/app/api/admin/workspaces/[workspaceId]/details/route.ts`
- `src/admin/workspace-details.tsx` and its `command-panel.tsx` placement
- `scripts/probe-m6-workspace-details.ts`

The route obtains the actor from the current server session and validates the
workspace identity and query allowlist. The domain repeats query validation and
requires a current operator or superadmin with completed MFA for that same live
session. Workspace membership, ownership, and support roles cannot authorize the
tenant detail read. Read-only inspection of suspended/held workspaces remains
available to the authorized operator.

Every successful page records the normalized access purpose and the requested
workspace in the same transaction as the read. Failed authorization, an invalid
purpose, and a missing workspace return no records. Each section filters by the
workspace and selects explicit columns. Membership email, provider customer and
subscription identifiers, business keys, stored snapshots, and secrets are not
serialized. Local record IDs and the selected product key remain available for
operational correlation. Credit quantities are decimal strings, preserving
integers beyond JavaScript's safe numeric range.

Pagination rejects unsupported/repeated query fields and limits pages to
1–10000 and page size to 1–100. All four sections use a deterministic secondary
identity ordering and fetch one extra row to calculate `hasMore`. The component
exposes read-only section selection, purpose entry, loading/error/empty states,
and bounded previous/next controls. It appears only in the operator/superadmin
panel; server authorization remains authoritative. Requests use the existing
same-origin, no-store transport, and values render as React text.

Final aggregate evidence:
`final/logs/m6-workspace-details.log` reports PASS on disposable local Docker
PostgreSQL. The probe covers all four sections, separate tenant fixtures,
three-page boundaries, purpose audit rows, private-field canaries, large integer
serialization, suspended-workspace inspection, support/owner rejection, wrong
session/revoked-role rejection, and query bounds. The new domain file has 100%
line and 90.63% branch coverage in that targeted run. The owner also reported
passing TypeScript and static checks before source freeze.

This review inspected the UI source; the dedicated probe exercises the domain
and parser rather than a browser-driven interaction or the Next route itself.
It does not certify real payment account data or the complete M6 aggregate.
The separate `queries.ts` effective-status change has its own review and is not
included in this approval.
