# modify-page

Modify a declared presentation page while preserving its real contracts.
Treat `DESIGN.md` and the shared design contract as the authority: reuse semantic tokens,
container widths, type scale, spacing rhythm and component state patterns before
adding page-local rules.

## Inputs
- Page/component target, intended behavior and baseline/dirty-work manifest.
- The visual delta and affected interaction states, including responsive and
  reduced-motion expectations.

## Allowed scope
Approved presentation components, styles, content, route metadata and the
declared shared brand tokens. Page-local styles must preserve the default
shell's color, focus, typography, spacing and control-size semantics. JavaScript
must preserve link semantics, keyboard access, loading/error feedback and
protected command boundaries.

## Protected contracts
Pricing bindings, checkout, auth, workspace, credits, generation and downloads remain server-owned.

## Outputs and evidence
Record semantic journey checks, visual state checks, responsive/accessibility
checks, exact diff and rollback patch.

## Recovery
Revert only attributable page changes and identify overlaps before applying a patch.

## Escalation
Hard-coded prices, mock success, auth bypass or protected imports block completion.
