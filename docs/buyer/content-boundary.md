# Customer content boundary

Customer guidance is derived from the versioned source under `content/docs/<release>/`. The customer package may include the Docs bodies, examples, Skills registry and supported setup instructions.

The package never includes `internal/`, `openspec/`, `.omx/`, `.git/`, private runtime state, credentials or the archived legacy platform. A release export is accepted only when its trusted validator digest matches the candidate source and lockfile.
