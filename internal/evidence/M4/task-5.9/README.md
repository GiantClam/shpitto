# M4 task 5.9: deterministic provider recovery evidence

The local deterministic probe covers the implemented provider recovery boundary without claiming a live Replicate or fal account. It verifies raw-body signature binding, exact provider/request/attempt identity, stale callback rejection, provider degradation at the unknown-age alert threshold and secret-free recovery telemetry.

Run:

```text
node --experimental-strip-types scripts/probe-provider-recovery.ts
```

The fixture result is retained as local contract evidence. It does not close task 5.10, which still requires account-backed T2V/I2V runs for both providers and durable downloaded outputs.
