# M0 auth/admin/domain transaction spike

Status: **READY_FOR_REVIEW — Better Auth PostgreSQL persistence, persisted disposable operator authorization, React-admin authorization, domain transaction and production-shaped RLS slices passed**. Better Auth signs up and reloads a bearer session through a new Drizzle PostgreSQL adapter instance; the PostgreSQL chain probe persists an operator role, proves member and cross-workspace admin reads, observes revocation on the next request, and reaches one idempotent Drizzle credit/audit/outbox command. Disposable PostgreSQL probes also prove rollback/idempotency and forced row-level security; see [auth-evidence.json](../spikes/selected-stack/auth/auth-evidence.json), [admin-evidence.json](../spikes/selected-stack/admin/admin-evidence.json), [admin-postgres-chain-evidence.json](../spikes/selected-stack/admin/admin-postgres-chain-evidence.json), [domain-evidence.json](../spikes/selected-stack/domain/domain-evidence.json), [migration-rls-evidence.json](../spikes/selected-stack/domain/migration-rls-evidence.json) and [better-auth-pg-evidence.json](../spikes/selected-stack/domain/better-auth-pg-evidence.json). Final production role administration, step-up policy and release migration promotion remain M1 work.

The required disposable slice is:

`Better Auth session → server operator authorization → React-admin read provider → domain credit command → Drizzle transaction → audit/outbox`

The spike must prove, with a real local PostgreSQL instance or an explicitly recorded unavailable dependency:

1. A session is authenticated by Better Auth and does not itself grant global operator privileges. **Observed in the disposable probe.**
2. A React-admin read is scoped by server authorization and cannot access another workspace by changing an ID. **Observed in the disposable authorization probe.**
3. One audited credit command commits domain, audit and outbox rows atomically. **Observed against disposable PostgreSQL 17.6.**
4. Injecting a domain, ledger, audit or outbox failure leaves no partial business mutation and a retry uses the same idempotency key. **Observed against disposable PostgreSQL 17.6.**
5. Role revocation is observed by a subsequent request and does not rely on a stale browser permission cache. **Observed in the combined authorization probe and PostgreSQL chain probe.**
6. A persisted operator role authorizes the React-admin read path and one Drizzle domain command; duplicate command replay produces one ledger/audit/outbox effect. **Observed in the PostgreSQL chain probe.**

This file is the M0 test shape. Implementation belongs under `internal/spikes/selected-stack/{auth,admin,domain}/` and the production boundary remains `src/modules/**` after M1.
