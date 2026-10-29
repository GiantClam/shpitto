# extend-assets

Add a declared asset type while preserving private ownership and media validation.

## Inputs
- MIME, size, path, retention, download and ingestion requirements.

## Allowed scope
Asset declarations, presentation metadata and isolated validation fixtures.

## Protected contracts
Do not make objects public, accept caller-supplied ownership, weaken MIME/size/path
checks or bypass tenant authorization.

## Outputs and evidence
Record ownership, ingestion, retention, private download and cleanup evidence.

## Recovery
Remove only the new asset declaration and its disposable objects; preserve existing
customer assets and unrelated work.

## Escalation
Storage, migration, ownership or download policy changes require engineering review.
