# Disposable PostgreSQL infrastructure preflight

Status: **READY** at 2026-10-19T06:06:39.516Z.

This packet covers local verification infrastructure only. Candidate freezing,
packaging, M7 workflows, M8 journeys, and release acceptance belong to their
respective execution owners.

Docker Desktop was launched with a hidden window. Its `desktop-linux` engine is
available. The requested historical container `shpitto-completion-pg-20261007`
does not exist in that engine. Inspection found an existing replacement created
on October 19 with the task label `shpitto.task=spec-current-20261019`, the
declared `postgres:15-alpine` image, and the required loopback port. This preflight
started that replacement and preserved its existing data volume.

- Container: `shpitto-completion-pg-20261019`
- Container ID: `8b9b6463e9f3146b4e32a641ca50eb01ec128936366d62581daa0b34337ea256`
- Endpoint: `127.0.0.1:55432`; administrative database: `postgres`
- Data volume: `ba6b83741241d9f8127544f829164fdc294cb113dce6e53897127636aa7c4003`
- PostgreSQL server, `pg_dump`, `pg_restore`, and `psql`: `15.19`
- Docker engine: `29.8.1`

`infrastructure-preflight.mjs` reads the local credentials from
`deploy/compose.local.yml` in memory and checks them against the inspected
container. No credential values are retained in this packet. The replacement's
initial default database is `postgres`, while the full local application's
compose default is `shpitto`. The isolated verification runners use `postgres`
to create their own databases, so this difference does not block that prerequisite.

The successful preflight verified authenticated host TCP access, the role's
CREATE DATABASE privilege, actual creation of two unique probe databases, a
custom-format backup with a table-data catalog, and restoration of the expected
row into the second probe database. Both probe databases and the temporary dump
were removed successfully. The recovered container remains running. Existing
application database rows and volumes were preserved.

The initial preflight rejected the harmless default-database difference before
connecting or creating databases. Its result is retained as
`infrastructure-preflight-initial.json`. The final checked result is
`infrastructure-preflight.json`; `node --check` also passed for the probe script.
A packet scan found zero occurrences of the declared local password value.

For the next M8 rerun, set the existing supported container override before
running the newly frozen candidate chosen by its owner:

```powershell
$env:SHPITTO_CANDIDATE_POSTGRES_CONTAINER = 'shpitto-completion-pg-20261019'
```

M7's workflow runner already targets `127.0.0.1:55432/postgres`. Backup tools are
available inside the named container through `docker exec`; host PostgreSQL
executables are not required by the existing candidate restore implementation.

No candidate was packaged or executed by this preflight. This evidence does not
promote M7/M8 gates or establish acceptance of any source digest or archive.
Production/shared services and paid/remote providers were outside this run.
