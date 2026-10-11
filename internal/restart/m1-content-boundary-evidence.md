# M1 content and guidance boundary evidence

Status: **READY_FOR_REVIEW** for task 2.7. This record defines source ownership and export classes; it does not claim the twelve Skills or Fumadocs runtime are complete.

## Observed result

- `corepack pnpm verify:content-boundaries` passed the registry, export-class, shared Docs source and legacy-guidance checks.
- `legacy/shpitto-platform/AGENTS.md` preserves the previous project harness guidance beside the archived source.
- `.shpitto/contracts/root-contract.md` references the OpenSpec change as the normative product contract and assigns database, domain, adapter, app, Docs and Skill ownership.
- `skills/registry.json` defines exactly twelve Skill entries, protected paths and the trusted validator owner. Every entry is marked `planned` until its M7 implementation evidence exists.
- `.shpitto/contracts/export-classes.json` separates customer runtime, buyer guidance and engineering evidence and excludes legacy/private/internal state from customer artifacts.
- `content/docs/v1/manifest.json` is the shared versioned Docs source; `docs/buyer/` contains customer-facing setup and boundary guidance only.

## Reproduction

```powershell
corepack pnpm verify:content-boundaries
```

The check is local and read-only. No customer export, remote service, credential or publishing action was performed.
