# M0 preservation and restore guidance

Status: **POST_MOVE_RELOCATION_VERIFIED**. The approved legacy source was moved after the fresh M1 snapshot; the post-move manifest and disposable restoration drill are complete.

## Current evidence

- Inventory: [inventory.json](inventory.json)
- Fresh pre-move manifest: [pre-move-manifest.json](pre-move-manifest.json)
- Relocation map: [relocation-map.json](relocation-map.json)
- Repository branch: `codex/restart-shpitto-m0`
- Repository HEAD: `6ad44be7b6f12fe028637f0300040bada826c47d`
- Tracked files hashed: `1780` (secret-bearing paths record metadata only)
- Pre-move working-tree status entries: `103`; post-move status includes the expected source deletions and archive files.

## M1 pre-move snapshot

The fresh manifest recorded the exact candidate source hashes, ignored/generated/private-state summaries, root retention policy, destination collision result and absolute-path safety review. The four candidate roots had no ordinary Git changes and the destination was absent when the move began. The private backup target remained record-only; no secret bytes were copied.

## M1 post-move evidence

- Post-move manifest: [post-move-manifest.json](post-move-manifest.json)
- Relocation journal: [relocation-journal.json](relocation-journal.json)
- Moved files: `1,686`
- Source bytes: `25,585,005`
- Destination tree digest: `26b6b5a0f682d532ffcc3d004faed6ae68439f3c8b1ca9ef402db1535feffb5f`
- Source files remaining at their mapped paths: `0`
- Destination hash/size mismatches: `0`
- Disposable restoration: `PASS`; all `1,686` files restored and an unrelated sentinel survived.

Five private runtime files became visible as untracked files after their nested ignore file moved with the archived source. They remain at their original paths and are recorded in the post-move manifest; the new-root ignore policy will address their visibility in task 2.3. They were not copied into the archive.

## Safe recovery procedure after the M1 move

1. Use `pre-move-manifest.json` and `relocation-journal.json` to identify the exact mapped source and destination paths.
2. Compare current hashes with the post-move manifest before restoring anything.
3. Restore only the mapped files into a disposable copy first; preserve unrelated paths and private state.
4. If a path changed after the snapshot, stop and reconcile per file. Never restore recursively over unrelated new work.

## Secret and private-state handling

The inventory omits secret contents and does not make private agent state part of a customer export. `.env` and credential-like files must be supplied through the selected environment contract during a later stage; they are not copied from this working tree.
