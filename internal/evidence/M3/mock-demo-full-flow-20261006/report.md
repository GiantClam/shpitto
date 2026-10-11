# Mock demo full-flow verification — 2026-10-06

This is a current local development verification record for the default UI baseline and the credential-free Mock journey. The marketing/auth/product shells and React-admin operations theme consume the named `brand.ts` token projection at the root layout, and the unit check covers that runtime wiring. It does not promote an acceptance gate.

The isolated Docker profile used PostgreSQL on host port `55434`, the database worker on `8080`, and Mailpit on `1025/8025`. The migrated disposable database passed generation lifecycle, race, assets, credit-ledger, generation-create, fixture billing, auth HTTP, team HTTP and API isolation probes. The browser journey showed the shared shell, seeded demo access, completed personal workspace setup, team/member entry, queued Mock generation, reload persistence, succeeded state, consumed credits and a private MP4 download link. The local fixture checkout displayed the explicit “no real charge” boundary and converged to `paid` after the simulated fixture event.

The admin route correctly showed an actionable access-denied state for the non-operator demo account; the operator probe separately passed step-up and revocation controls. Real provider, real payment, production mail/storage, affiliate settlement and hosted deployment evidence remain deferred by scope.
