# M4 task 5.7: bounded private output ingestion

`fetchPrivateProviderOutput` accepts only public HTTPS locations without credentials, revalidates every redirect, rejects private/link-local DNS answers, enforces video MIME and a 250 MiB streaming limit, and returns a temporary source only for immediate private materialization. `materializeProviderOutput` reuses the existing owned asset and media-probe boundary, so a provider URL is never stored as permanent delivery.

Contract coverage is in `tests/contracts/provider-webhooks.test.ts`; the local asset and generation Docker probes continue to pass. The implementation is transport-injected for deterministic tests and does not claim an S3/R2 account or a live provider URL.
