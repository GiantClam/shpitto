# M5 hosted Stripe acceptance checkout evidence

Date: 2026-10-26. Scope: hosted Acceptance authentication, Stripe test Checkout and billing Portal authorization. This packet does not close task 6.10 because the subscription lifecycle, refund, dispute and webhook replay scenarios were not run in this evidence window.

The hosted origin was `https://shpitto-m4-web-production.up.railway.app`. The Checkout and Portal run used Railway deployment `0a1d213a-e093-4803-895c-364bf5128365`; the final cleanup deployment was `0d28a620-51f1-4701-b87c-4b7d9dc451c3`. Both deployments served the Acceptance profile. `GET /api/healthz` returned HTTP 200 with `status=ready`, `profile=acceptance` and `database=ready`.

The acceptance-only bootstrap route created one verified owner and one verified member in a new team workspace. The credentials were returned once over HTTPS and were held only in the verification process. No password, bearer secret or signed Portal URL is stored in this packet. The hosted owner and member sign-ins both returned HTTP 200 and returned a user identity.

The owner opened the configured Acceptance product `acceptance-pack`. The application created a real Stripe test-mode Checkout Session with provider `stripe`, status `open`, provider session ID `cs_test_a1dRwrKM1goSlgAwD6wpSxHnw4StwnAR8fOLkiJzaI61Q35qy6lGRnQ2c7`, and a Checkout URL. The owner also opened a Stripe test-mode billing Portal URL. The signed Portal URL is intentionally omitted.

The member was denied both billing actions with HTTP 403 and error code `FORBIDDEN`, confirming that only the current workspace owner can create Checkout or open the Portal.

After evidence collection, the bootstrap route was disabled and its Railway secret variable was deleted. A request using the previously valid local bearer returned HTTP 403 with `Acceptance bootstrap is disabled.` The final health check remained ready.

Automated local checks also passed:

- Acceptance bootstrap and final acceptance queue tests: 5/5.
- TypeScript `noEmit` check: passed.
- Deployment preflight: passed.
- Railway code deployment and post-cleanup deployment: successful.

The following claims remain `NOT_RUN` and must stay open: subscription lifecycle, refund, dispute and webhook replay. The current automated result is therefore ready for human review with a recommended `RETURN_FOR_EVIDENCE`, because the authenticated hosted Checkout/Portal slice is proven but the full 6.10 scope is incomplete.

Human reviewers choose one decision from the evidence package:

- `PASS`: accept this exact evidence scope only if the reviewer agrees that the scoped result is sufficient for the applicable checkpoint.
- `FAIL`: reject the evidence or observed behavior.
- `RETURN_FOR_EVIDENCE`: request the missing lifecycle, refund, dispute or webhook replay evidence.

Reviewers do not rerun the tests as a substitute for reading this package. All provider operations used Stripe test mode; no live key, real charge, real refund, payout or settlement was used.
