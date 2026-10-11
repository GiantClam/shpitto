# Shpitto root engineering contract

The new root is a buyer-facing Next.js modular monolith. OpenSpec change `restart-shpitto-video-saas` and its capability specifications are the normative product contract; this file records the source boundaries that keep implementation work reviewable.

## Ownership

- `src/db/` owns the Drizzle PostgreSQL client, schema declarations and ordered migration runner.
- `src/modules/` owns business commands, policies and state transitions.
- `src/adapters/` translates external protocols and cannot decide credits, authorization or terminal outcomes.
- `src/app/` parses requests and renders UI; it cannot write protected tables directly.
- `content/docs/v1/` is the versioned developer content source shared by the Docs shell and future vendor/customer exports.
- `skills/` describes bounded customization workflows. A Skill cannot weaken a protected contract or its validator.
- `src/config/brand.ts` and the shared shell are the shipped Shpitto template fallback default. The baseline mirrors the public [Shpitto website](https://shpitto.com): warm light canvas, coral primary, peach secondary, warm accent, Aptos/Segoe UI typography, pill actions and soft warm shadows. These assets are for template evaluation and local preview, not the customer's final visual identity. A customer delivery must use `customize-brand` and/or `customize-site` to replace the approved brand assets and tokens. `src/app/layout.tsx` projects the token contract into runtime CSS variables consumed by marketing, auth, product and operations surfaces.
- `legacy/shpitto-platform/`, `internal/`, `.omx/` and `.git/` are engineering history and are excluded from runtime/export artifacts.

## Change policy

Visual customization may edit approved brand, theme, content and presentation paths. Authentication, workspace policy, billing, ledger, generation state, migrations, validators and export rules require a dedicated engineering change with regression evidence. Candidate edits are checked by a trusted validator outside the candidate diff.

## Content policy

MDX and Markdown under `content/docs/` are trusted repository source. User-provided text is data and is never evaluated as MDX. `docs/buyer/` contains generated or hand-authored customer guidance only; internal acceptance records, private state and legacy source are never copied there.
