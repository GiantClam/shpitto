# M3 selected-database regression, October 19, 2026

The verifier previously replaced its successfully selected disposable database
connection with a hardcoded passwordless PostgreSQL URL for protocol probes.
`protocol-red.log` reproduces the resulting SCRAM authentication failure. That
failed process was stopped after retaining its error.

The verifier now passes the same isolated database URL used by its other
probes. It preserves selected credentials and avoids writing fixture tables to
the administrative database. No application connection policy was changed.

`protocol-green.log` records the actual generation replay probe passing on a
dedicated local database: ten concurrent create, cancel and settlement calls
each produced one effect and nine replays, with twenty callback deliveries and
no unrelated-record changes. `crash-green.log` records real SIGKILL/restart
checks at reservation, dispatch, ambiguous response, uploaded object and
success-before-ack boundaries. The remote webhook inbox remains in the later
provider profile. The dedicated database was dropped after verification.

Commands used Node's installed TypeScript support and the repository's actual
`scripts/probe-generation-replay.ts` and `scripts/probe-m3-crash-restart.ts`.
This bounded repair evidence does not replace the full current M3 run or its
independent review.
