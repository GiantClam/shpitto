# Asset cleanup correction plan

Owner layer: local asset maintenance and worker scheduling.

The generation lifecycle contract already requires a twenty-four-hour orphan
grace period and retention of live references. The implementation has no scheduled
cleanup caller, and repeatedly inspects the first 1,000 files, allowing retained
files to starve later orphans.

1. Add isolated PostgreSQL regression coverage for scan progress across retained
   files, restart, deletion failure, new files behind the cursor, tenant scope,
   and storage path/symlink fences. Add a scheduling test before implementation.
2. Persist the last scanned object key after each completed bounded page. Use a
   sorted walk, atomic cursor replacement, and wrap to the beginning on exhaustion.
   Cursor loss or malformed state restarts scanning without relaxing deletion checks.
3. Add an independent, non-overlapping local cleanup timer. Enumerate workspace
   records even when no generation dispatch is available; isolate cleanup failure
   from deadline recovery and generation dispatch.
4. Run the new isolated probe, the existing asset probe, scheduling tests,
   typecheck, lint, formatting and source-boundary checks. The root agent owns the
   complete M3 verification and formal acceptance record.

Upstream inspected: generation-lifecycle/spec.md REQ-GEN-09 and SC-GEN-18,
the technical design asset lifecycle section, local storage containment checks,
and existing cleanup/worker implementations. A contract edit cannot schedule a
missing caller or advance a physical scan, so the correction belongs here.

Keep existing pending-row locking, global live-reference checks, retention
boundaries, workspace/task prefixes, and validated private object deletion.
No dependencies, schema changes, configuration changes, or formal record edits.

## Verification result

- Before implementation, the isolated cleanup probe failed because a fresh
  process repeated the retained first page and never collected the later orphan.
  The scheduling unit test failed because the independent loop did not exist.
- Independent review found a directory/file name collision in cursor pruning.
  The probe now fixes the page boundary at `a.txt` after 999 retained files and
  requires the next process to collect `a/orphan.bin`. That regression failed
  before the corrected directory ordering and passed afterward.
- Disposable PostgreSQL probes `asset-cleanup`, `assets`, and `m3-recovery` pass.
  Each disposable database was dropped after execution; no live data was used.
- The cleanup probe proves bounded page size, restart progress, full-cycle retry,
  recent file retention, a new earlier key, global references, tenant scope,
  symlink/traversal fences, malformed cursor reset, and the default scheduled
  worker cleanup with an empty dispatch queue.
- The deterministic scheduling unit test proves independent ticks, no overlapping
  jobs or queued backlog, recovery after failure, and clean shutdown.
- Typecheck, source-boundary lint, formatting, and database-boundary checks pass.
- The worker materialization call now passes only an explicitly supplied test
  timestamp, allowing real execution to resample the clock after blocking work.

Residual limits: filesystem directory listing/sorting and workspace enumeration
are still proportional to directory/workspace size, while each workspace page
inspects at most 1,000 regular files. An abrupt process death during atomic cursor
replacement can leave an unused temporary marker; loss of a cursor safely repeats
a page. Concurrent local workers may repeat a page, but retain the same deletion
guards. Full M3 verification remains owned by the root agent.
