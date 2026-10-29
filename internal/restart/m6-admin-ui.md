# M6 local administration

The `/admin` entry checks the live Better Auth identity and current global role on the server. Workspace ownership does not grant entry. Before loading operational resources, the client checks `/api/admin/security` and requires completed second-factor verification for that session.

The security screen enrolls an authenticator through Better Auth using the existing account password, shows the setup key and recovery codes only in component memory, and verifies a code through the privileged step-up endpoint. The operations dashboard supports renewed verification for commands after the ten-minute freshness window.

The project-owned administration foundation supplies resource routing, session integration, read tables, filters and partial pagination. Resource navigation stays under `/admin?view=...` and uses application-owned routes. Lists cover workspaces, users, generations, billing orders and audit events. Generic create, update and delete actions are deliberately unavailable; supported changes use named commands. The image and video template variants share this shell and declare media capabilities explicitly. `shadcn-admin` is a page-structure reference only.

For an operator or superadmin, the dashboard supports:

- Audited workspace detail and recovery evidence reads with a stated access purpose.
- Audited, paginated memberships, subscription state, credit grants and immutable ledger records in **Workspace records**. Reads expose selected operational columns, preserve exact credit integers and omit customer identities, raw catalog snapshots, contact details and stored business keys.
- Workspace suspension/reactivation, account disablement and credit adjustments.
- Refund preview and the versioned privileged refund request.
- A versioned expired-task recovery sweep using the existing domain recovery policy.
- A named replay of an authenticated stored provider notification, retaining its original provider event identity and the existing domain materialization/settlement rules. The command accepts an inbox ID rather than a replacement status or payload.
- Global role changes for superadmins.
- Bounded affiliate review/hold lists and named approval, denial, legitimate hold release and campaign policy review commands. The route injects the server-owned unavailable provider authority until a provider integration is explicitly configured and verified. Disabled/unavailable status is visible and cannot be overridden by request data.
- A hosted payout dashboard link returned only by the audited handoff command; the interface never labels a redirect or review approval as transferred funds.

Each new command receives a fresh browser-generated idempotency key. The retry button resends the complete previous request with the same key and expected version, including after an ambiguous network failure. Editing fields and submitting creates a new command, so a stale version remains a server-side conflict.

The **Resume pending refunds** section restores the current operator's pending or unknown refund commands from server evidence after a reload. The read requires a workspace and access purpose, is audited and paginated, and verifies the reconstructed request against the persisted semantic hash before offering an exact retry. The original command key, reviewed version and omitted or explicit amount remain unchanged. Other operators cannot recover that command identity.

Refund delivery first claims and audits its persisted outbox lease. A committed intent that was never claimed can be dispatched by an authorized exact retry. Once any dispatch may have started, retries can only query authoritative provider evidence; they never submit another refund. A missing lookup or unresolved response remains `unknown`. This local path is driven by operator retries, and does not claim an autonomous background refund dispatcher or live provider integration.

Use the access version in the Users list for account disablement, role version for global roles, workspace version for workspace status/recovery, credit account version from workspace inspection for adjustments, and the expected version returned by the refund preview. The server remains the authorization and accounting authority.

Recovery inspection exposes task/attempt/inbox/outbox/asset correlation without raw payloads, storage keys or signed URLs. Model health describes only the selected workspace task sample (at most 100 tasks and 100 rows per correlation), with no-success evidence labelled unavailable and live-disabled catalog entries explicitly identified. It is not a production-wide health claim. Confirmed cost evidence is counted separately from unknown and not-applicable values.

`tests/unit/admin-adapters.test.ts` verifies filter/sort forwarding, exact target/purpose reads, truthful partial pagination, status-bearing authorization failures, generic-write rejection and stable versioned command retries. Live accounts, external provider calls and final release-profile delivery are separate validation stages.
