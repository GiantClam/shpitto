# Embedded Checkout mount (Staging) — 2026-10-30 Asia/Shanghai

- Status: **MOUNT_OK** (not M5 stage PASS; Pay not clicked)
- APP_URL: https://shpitto-m4-web-production.up.railway.app
- Workspace: 88e1b0a0-a097-4a8c-b274-f5b8f0ab80d1
- After PR #7 merge + redeploy (`client_secret` URL-encoded suffix validation fix)
- Action: owner signed in at `/login`; Open checkout on USD 9 Permanent credit pack
- Result: on-page `iframe[name="embedded-checkout"]` from js.stripe.com; TEST MODE; $9.00; Pay not clicked
- No HTTP 500; no incomplete hosted checkout.stripe.com redirect
- Screenshot: embedded-checkout-mounted-usd9.png
