# M0 Docs, media and standalone packaging spike

Status: **READY FOR REVIEW — Docs, admin isolation, standalone packaging and worker media fixture passed**. Fumadocs static source/search, React-admin client contract, the selected Next standalone output and a Linux worker image are now observed in disposable probes. Host FFmpeg/ffprobe 7.0 checksums and container FFmpeg/ffprobe 5.1.9 versions are recorded as provenance. The worker evidence records the Debian base digest, image ID, fixture metadata and input/output hashes.

Required disposable checks:

- Fumadocs static source resolves deterministic navigation/search without importing application secrets. Release-tagged MDX compilation remains a later content check.
- React-admin is isolated as a client-only operations surface and does not gain generic writes to domain tables in the probe.
- A worker/container image includes the selected media toolchain and processes a local fixture without relying on a host-only binary. See [worker-evidence.json](../spikes/selected-stack/packaging/worker-evidence.json).
- Next standalone output includes only the target app runtime and can be started from a clean directory.
- Host media checksums, container provenance and direct package notices are recorded before any source is copied into the customer template. Final shipped-image notice inventory remains a release packaging task.

The current legacy app is evidence of neither target compatibility nor customer packaging. The prototype must be disposable and must not mutate the legacy lockfile or source tree.
