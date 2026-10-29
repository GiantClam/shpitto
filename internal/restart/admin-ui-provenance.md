# Template administration UI provenance

Date: 2026-10-21

The delivered image and video templates own their administration presentation source. The runtime uses editable primitives under `src/components/ui`, shared admin composites under `src/admin` and `src/components/admin`, and the application-owned shell under `src/components/shell/admin-shell.tsx`.

The primitives follow the shadcn/ui composition model, but they are intentionally local and dependency-free. They were authored for this repository and do not require a hosted registry, online component runtime, Tailwind, MUI, Emotion, React-admin, or shadcn-admin at build or runtime. `shadcn-admin` informed navigation, shell composition, list/detail layout, filters and operational grouping only.

The shared capability manifest is `src/admin/capabilities.ts`. It declares common resources plus image and video variants. The current repository implements video generation and therefore exposes video media capability details. Image-specific media controls are explicitly withheld until image generation and asset contracts are implemented; the image variant does not claim runtime support merely because the shared shell can render it.

The presentation source is covered by the customer export contract. Backend authority remains in Better Auth, server-side operator authorization, allowlisted queries, named commands, Drizzle migrations, transaction boundaries, audit records and recovery contracts.

## Dependency and notice inventory

| Item | Runtime dependency | Source ownership | Notice requirement |
| --- | --- | --- | --- |
| Local UI primitives | None beyond React | Project-owned editable source | No third-party component notice required |
| Admin composites and resource views | Existing React/Next runtime | Project-owned editable source | No hosted admin runtime notice required |
| shadcn/ui | Composition and source-ownership pattern | Reference pattern only; no registry package is bundled | No copied upstream source in this change |
| shadcn-admin | Page structure and information architecture reference | Reference only; no application code or runtime is bundled | No shadcn-admin runtime notice required |
| React-admin, MUI, Emotion | Removed from customer runtime | Superseded | No longer present in `package.json`, lockfile or `src` |

Verification for this inventory includes the project typecheck, source-boundary check, focused adapter and shell tests, and a lockfile scan showing no React-admin, MUI or Emotion entries.

