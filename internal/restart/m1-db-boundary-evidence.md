# M1 database boundary evidence

Status: **READY_FOR_REVIEW** for task 2.4. This record establishes the new root database boundary; it does not claim identity, credits, billing or generation tables are complete.

## Observed result

- `corepack pnpm typecheck` passed.
- `corepack pnpm lint` passed the legacy/vendor and server-boundary import policy.
- `corepack pnpm verify:db-boundary` passed the migration-owner, journal, advisory-lock and no-push checks.
- A disposable PostgreSQL 15 container accepted `corepack pnpm db:migrate` twice with exit code `0`.
- The second run retained one `app.schema_ownership` row and one `drizzle.__drizzle_migrations` row, proving the reviewed migration is repeatable.
- The same disposable profile passed `corepack pnpm db:probe`: an injected Drizzle transaction failure removed its temporary table, while the committed transaction retained exactly one row.
- The migration command used a direct `pg.Client`, acquired `hashtextextended('shpitto:drizzle:migrations:v1', 0)` through `pg_advisory_lock`, ran Drizzle's PostgreSQL migrator, released the lock and closed the connection.

## Boundary decisions

- `src/db/client.ts` is the only database client factory. Request code receives a Drizzle database handle and never performs schema changes.
- `src/db/migrations/` is the only migration directory. The journal is checked in and the runner is the only supported migration entry point.
- `src/db/contracts.ts` owns entity IDs, UTC timestamp conversion, clock injection and safe domain error codes.
- `src/adapters/contracts.ts` contains protocol-neutral adapter results. Database, UI and archived platform imports are rejected by static policy.
- `app.schema_ownership` reserves domain schema ownership for later milestones without importing the archived data model.

## Reproduction

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55435/shpitto_m1'
corepack pnpm verify:db-boundary
corepack pnpm db:migrate
corepack pnpm db:migrate
corepack pnpm db:probe
```

The database URL above is a disposable local profile. No provider, payment, deployment or hosted service was contacted.

## Deferred work

Workspace, auth, credit, billing, generation and operator tables remain owned by their milestone tasks. PostgreSQL RLS, production roles and release migration promotion must be added with the corresponding domain specifications; this foundation intentionally does not mirror the archived platform schema.
