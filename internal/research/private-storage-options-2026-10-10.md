# Private media storage options for Shpitto

Date: 2026-10-10

## Decision

Shpitto should expose one private object-storage port with two production-compatible modes:

- `local`: filesystem storage for local development, Docker demo and offline acceptance only.
- `s3`: S3-compatible object storage for hosted and customer production deployments. Cloudflare R2 is the reference managed profile; AWS S3 is the enterprise/provider alternative; MinIO is a local S3-compatible test double.

The generation domain stores an opaque object key and media metadata. It never stores provider URLs as durable asset locations. Download authorization remains an application decision; the storage backend only reads or writes the already-authorized object.

## Evidence and comparison

| Backend | Intended profile | Strengths | Constraints | Decision |
|---|---|---|---|---|
| Local filesystem | Local/dev/demo/Docker acceptance | Zero cloud credentials, easy deterministic probes, works offline | Single-node durability, volume backup/retention is the operator's responsibility, unsuitable for horizontally scaled managed web/worker | Required local adapter |
| Cloudflare R2 | Hosted reference production | S3 API compatibility, suitable for private buckets, good fit with Cloudflare/Vercel edge deployments | R2 does not implement every AWS S3 operation; the adapter must stay inside the documented common subset | Preferred managed profile |
| AWS S3 | Buyer enterprise production | Mature IAM, lifecycle, replication, compliance and regional controls | More setup and cost/egress policy choices | Supported through the same S3-compatible adapter |
| MinIO | Local integration testing | S3-compatible API without a cloud account | Operational durability is local/operator-owned | Test-only compatibility target |
| Supabase Storage | Optional alternative | Private buckets and signed URLs are available | Adds a second storage/control plane beside the existing Postgres/auth design and does not match the selected deployment baseline | Do not add in V1 |

Cloudflare documents R2 as exposing an S3-compatible API at an account endpoint, while also documenting that its operation coverage differs from AWS S3; this supports one bounded common adapter instead of provider-specific domain behavior. See [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/).

AWS documents presigned URLs as time-limited access for private object upload/download, with expiration governed by the signing credentials and URL lifetime. Shpitto may use server streaming first and add presigned delivery later without changing the domain object-key contract. See [AWS S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

Supabase documents private buckets with authorization and time-limited signed URLs. It is a valid pattern, but it would add another storage authorization surface to this template's selected PostgreSQL + S3-compatible baseline. See [Supabase Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Required application contract

1. All asset writes go through one `PrivateObjectStore` interface.
2. The interface supports `put`, `get`, `delete`, and bounded metadata needed for media validation.
3. Object keys are opaque, tenant-scoped and validated; provider URLs are never persisted as asset locations.
4. Provider output is fetched with HTTPS/DNS/redirect/MIME/size checks before object-store write.
5. Database publication happens only after object write and media probe succeed; failed publication deletes the object or schedules an orphan cleanup.
6. Downloads require application workspace authorization and a short-lived capability; public buckets and permanent provider URLs are forbidden.
7. Local cleanup may scan the filesystem. S3-compatible cleanup uses database references, lifecycle rules and bounded orphan reconciliation rather than assuming directory listing semantics.
8. Production startup rejects `local` storage; `s3` requires endpoint, bucket, region and credentials.

## Open implementation work

- Add the storage port and local/S3-compatible adapters.
- Add R2/S3 environment variables and fail-closed production validation.
- Route upload, provider materialization, authorized download and deletion through the port.
- Add a MinIO or mocked S3 contract probe without making MinIO a production dependency.
- Add real fal/Replicate evidence showing provider output crossing the private-store boundary and settling the domain reservation.
