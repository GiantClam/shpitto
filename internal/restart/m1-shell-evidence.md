# M1 product shell evidence

Status: **READY_FOR_REVIEW** for task 2.6. The shell routes are intentionally preview surfaces; they do not implement authentication, billing, public API writes or domain commands.

## Observed result

- `corepack pnpm verify:shells` passed route, Docs source, client-only admin and deferred-behavior checks.
- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm format:check` and `corepack pnpm build` passed.
- The build produced `/`, `/login`, `/dashboard`, `/admin/[[...segments]]`, `/docs`, `/docs/skills` and `/docs/api` routes.
- The marketing, auth and app routes share the site shell. The admin route uses a separate client-only shell and an explicit server guard integration point.
- Versioned Docs source is present under `content/docs/v1/`; navigation labels it as a contract preview until the Fumadocs milestone is implemented.

## Boundary decisions

- English-first route and navigation copy is the runtime default; localization can be added behind the navigation contract.
- Admin presentation is isolated under `src/components/shell/admin-shell.tsx` and is not imported by product routes.
- Placeholder surfaces report `planned`, `preview` or `not-configured` status and do not provide fake successful actions.
- `src/lib/server/guards.ts` exposes the server guard seams for Better Auth and global operator authorization without creating a second auth implementation.

## Deferred work

Better Auth flows, workspace authorization, React-admin resources, Fumadocs compilation/search and buyer journeys are owned by M2, M6, M7 and later tasks. This evidence does not close those behaviors.
