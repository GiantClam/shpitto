# Actual four-workflow local evidence

This packet addresses the execution gap in M7 task 8.9. It applies real, independent presentation changes for `customize-brand`, `create-page`, `modify-page`, and `customize-site` to disposable source copies. It retains actual Git patches, manifests, protected-file byte hashes, fresh command output, local database probes, rendered viewport observations and scoped rollback results.

Run from the repository root with the installed Node 24 runtime:

```powershell
node --experimental-strip-types internal/evidence/m7/workflows-current-20261019/run-workflows.mjs
```

Set `SHPITTO_M7_EXPECTED_SOURCE_SHA` to the integrator's frozen source digest before a final run. Without that explicit value, results are labeled provisional and do not claim to match the final root candidate. Each invocation gets its own run directory and disposable source directories under `.data`. It uses the existing Docker PostgreSQL instance at port 55432 with dedicated temporary databases and does not reset the demo database or stop user servers. Existing dependencies are reused through a local directory junction; no packages are installed.

The viewport smoke compiles the actual modified React presentation modules using the installed TypeScript compiler and renders their static markup with the real CSS and local billing catalog. It checks desktop 1440x900 and mobile 390x844, keyboard traversal and horizontal overflow. This does not prove Next.js routing, hydration, authenticated browser checkout or full visual acceptance. Domain probes separately execute actual candidate auth, credit, generation, billing and admin modules against disposable PostgreSQL databases.

The semantic negative control changes a real checkout callback and is rejected by the harness's explicit AST invariant. It is not presented as an automated semantic capability of the shipped manifest validator. Protected-path classification and overlapping rollback controls also call the shipped candidate utilities. All findings remain local/mock evidence with independent review and the M7 gate open.
