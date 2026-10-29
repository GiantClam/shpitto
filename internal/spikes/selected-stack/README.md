# Selected-stack feasibility spike

This disposable app is the M0 compatibility probe for the restart plan. It is not the production application and must not import legacy modules or credentials.

The package pins the versions selected in the approved design. `pnpm-lock.yaml` is generated only inside this directory. A successful install, typecheck and build is evidence for M0 feasibility; it does not approve source relocation or close M0 by itself. `src/contracts-probe.ts` checks that the Better Auth, Drizzle and React-admin entry points resolve without opening a database or reading secrets.

The disposable media worker is under `worker/`. Run `node worker/worker-probe.mjs` with a Linux Docker daemon to build the pinned Debian image, generate and transcode a local fixture, and write `packaging/worker-evidence.json`. The worker probe is local packaging evidence only; it does not call a provider or payment service.
