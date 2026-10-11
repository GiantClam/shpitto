# Isolated vendor commerce setup

Tasks 9.10 and 9.13 have a locally executable implementation. Real merchant
approval, approved business terms, hosted product configuration and public
commerce authorization remain external release prerequisites.

## Local walkthrough

Run `node vendor/sales/server.mjs`, then visit `http://127.0.0.1:3200`.
The server binds only to loopback. Open source checkout, view the simulated
receipt, inspect the proposed terms, and return to the landing page. No account,
payment, invitation, source download or persisted entitlement is created.
The fixture digest on the receipt deliberately identifies no release archive.
For the real local candidate rehearsal, use `corepack pnpm verify:fulfillment-local`.

Run `node --test --experimental-test-coverage tests/vendor/commerce.test.mjs`
to exercise the HTTP journey, failed prerequisites, order separation, replay,
expiry and renewal. Start the application on port 3100 for `/docs`: the sales
preview forwards only public Docs and Next static assets to that loopback origin,
without forwarding cookies or authorization. Missing Docs return a recoverable
503; SaaS API and admin routes are never proxied.

## Business and account boundaries

| Concern | Vendor source sale | Buyer-operated video SaaS |
| --- | --- | --- |
| Checkout / merchant | Lemon Squeezy hosted checkout | Buyer's Stripe account |
| Affiliates | Lemon Squeezy merchant affiliate program | Optional buyer FirstPromoter program |
| Orders | Vendor-only paid source order and acquired release | Workspace subscription / credit purchase |
| Entitlement | Acquired source plus update/support term | SaaS credit ledger and plan |
| Attribution / settlement | Source merchant's approved program | Buyer SaaS rules and settlement |
| Credentials and private records | Operator-managed vendor environment | Buyer-managed runtime environment |

`vendor/sales/commerce.mjs` has no SaaS imports, database writes, webhook hooks,
credit allocation or FirstPromoter calls. It rejects Stripe orders and mismatched
merchant/mode identities. Replay preserves the prior source entitlement; conflicting
order identities fail rather than silently changing the owner. None of `vendor/`
or `internal/vendor/` belongs to the customer runtime export.

## Prepare real hosted checkout later

1. Obtain merchant eligibility/approval and payout-onboarding evidence in the
   actual legal entity's Lemon Squeezy account. Record account and environment
   identities privately; do not put credentials, raw buyer data or paid links in
   this repository.
2. Resolve each row of `commercial-readiness.md`. Approve exact policy versions,
   price/currency, license limits and affiliate economics before publishing them.
3. Create the source product and hosted checkout in that merchant account. Keep
   SaaS Stripe products, customer IDs, referrals and credentials separate.
4. In a private vendor deployment configuration, set `mode` to `hosted`, the
   actual merchant identity and the HTTPS Lemon Squeezy `/checkout/buy/...` URL.
   `commerce.config.json` is the safe local example; no secret is required by
   this link-only hosted checkout design. Do not add an API key to the file.
5. Resolve every `approvals` entry to an approved internal record reference.
   A status without an evidence reference remains blocked. The reference means
   an operator has actually reviewed that record; code cannot certify merchant
   approval from a string. `publicationAuthorization` is a separate final gate.
6. Rehearse a permitted real merchant test-mode order and verify its paid status
   in the merchant console. Store only sanitized identity/evidence references.
   Only then run the fulfillment procedure with the exact checksum candidate.
7. Record live hosted checkout, merchant affiliate attribution and supported
   payout onboarding separately from Mock evidence. The local server is a
   preview entrypoint, not production hosting or payment authorization.

The hosted URL validator accepts only HTTPS merchant subdomains under
`lemonsqueezy.com`, a buy-checkout path, and no embedded credentials, query
parameters or fragment. It does not implement a marketplace, custom payment
form, affiliate payout engine or vendor license server.
