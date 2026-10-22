# Current M3 evidence attempts, October 19, 2026

This index preserves development attempts without treating an earlier snapshot
as final acceptance. Historical October 1 approval remains in its original
record and is not current-candidate approval.

| Directory suffix | Observed result | Acceptance limitation |
| --- | --- | --- |
| `browser-current-20261019` | Public generator observations | Public controls only; no authenticated journey or reference comparison. |
| `browser-journeys-20261019-81a0317f` | Failed setup | Database creation privilege was insufficient. |
| `browser-journeys-20261019-a41f3db7` | Failed runtime setup | Temporary task-runtime configuration was invalid. |
| `browser-journeys-20261019-321576f5` | Journeys completed; freshness failed | Source changed concurrently; the run does not certify the final candidate. |
| `browser-journeys-20261019-520689c0` | Journeys completed | Intermediate fingerprint; cleanup recorded `servicesStopped: false`. |
| `browser-journeys-20261019-c011faae` | Journeys completed | Intermediate fingerprint; cleanup recorded `servicesStopped: false`. |

The two completed snapshots above retain genuine journey assertions. They do
not close final acceptance: trusted-validator implementation subsequently
changed the source/validator digests. The cleanup helper has also been corrected
to query database absence and to distinguish a signal-terminated process from a
running process. A final fresh run must retain the corrected cleanup result.
