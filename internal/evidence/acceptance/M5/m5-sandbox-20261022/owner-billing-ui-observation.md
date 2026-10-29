# Owner billing UI observation

- **Date:** 2026-10-22
- **Environment:** Existing Shpitto Acceptance deployment (`shpitto-acceptance-20261020.vercel.app`)
- **Journey:** Read the existing workspace billing route in the already-authenticated browser session. No controls were submitted and no Checkout or portal action was started.
- **Observed:** The page rendered the owner workspace billing view with 2 orders, 1 subscription, 2 credit grants and a clear recovery state. Its catalog lists USD 25.00 and USD 9.00, while payment history displays `USD 2500`, `USD 900` and `refunded 900` without currency-minor-unit formatting. The deployed page also lacks the current local grant-detail rows and cash-versus-credit explanation.
- **Result:** Partial owner-view observation only. This deployed build predates the local billing presentation change, so it does not validate the changed page. The authenticated member-denial and workspace-isolation journey remains open.
- **Safety:** Read-only observation; no login data was entered, no account or billing data was changed, and no payment session was created.
- **Follow-up:** Verify the current candidate's owner page and capture the member-denied view with workspace isolation. Do not initiate Checkout for this UI journey.
