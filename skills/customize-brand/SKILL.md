# customize-brand

Change approved brand tokens, assets and copy across the shared presentation
shells. The default template ships a complete Shpitto baseline for evaluation
and local preview. It is a fallback, not a customer's final visual identity;
customer delivery requires this Skill to define the customer's own visual
assets and tokens.

Use `DESIGN.md` with `src/config/brand.ts` as the design contract. Treat its semantic roles,
type scale, spacing rhythm, surface ladder, component states and motion values
as one system, following the DESIGN.md pattern of naming reusable decisions
before writing page CSS.

## Inputs
- Customer brand name, colors, logo/font assets, copy and responsive/accessibility intent.
- The fallback token contract in `src/config/brand.ts` (cool light canvas,
  accessible red primary, blue secondary, semantic ink/status/focus colors,
  Inter/system typography, 4px base rhythm and component state tokens).
- A visual brief covering mood, density, imagery, primary action, dark/light
  surfaces, responsive intent and reduced-motion behavior.
- The relevant `DESIGN.md` sections for the brand's component and responsive
  decisions.

## Allowed scope
`src/config/brand.ts`, `public/brand`, approved shell presentation paths,
`src/app/globals.css` token bindings and marketing copy. Do not scatter one-off
colors, type sizes, radii, shadows, breakpoints or control dimensions into a
page when a shared token exists.

## Protected contracts
Preserve sign-in, workspace, generation, download and billing actions and all auth,
ledger, provider, storage and validator paths.

## Outputs and evidence
Record a scoped manifest naming the customer assets, semantic token map,
component states, desktop/mobile screenshots or assertions, keyboard focus and
contrast checks, consistent navigation/control dimensions and a recovery patch.
The manifest must distinguish template fallback assets from customer-selected
assets and must state the primary CTA and responsive collapse rules.

## Recovery
Revert only the brand-attributable files after checking overlaps.

## Escalation
A request that changes a protected flow becomes an engineering change.
