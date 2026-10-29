# M4 task 5.4: authenticated provider callbacks

This is the local callback contract slice. Replicate callbacks verify the raw-body HMAC envelope with a bounded timestamp; fal callbacks verify an ED25519 signature over the canonical event, timestamp and body digest. Both bind the persisted provider request and attempt nonce, enforce an optional account identity, and reject stale or altered events before the inbox write.

`provider_webhook_inbox` is acknowledged with a sanitized payload and a unique provider/event identity before optional domain processing. Duplicate deliveries are replay-safe and payload reuse with a different hash is rejected.

Verification: `tests/contracts/provider-webhooks.test.ts`, `node --experimental-strip-types scripts/probe-provider-recovery.ts`, `corepack pnpm typecheck`, and `corepack pnpm build` pass. No real provider account or network callback is claimed.
