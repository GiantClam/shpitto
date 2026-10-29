# configure-credits

Propose a versioned plan or tariff change with explicit expiry and ledger effects.

## Inputs
- Versioned catalog, grant buckets, expiry policy and authorized owner intent.

## Allowed scope
Reviewed plan configuration and documentation that references the active catalog.

## Protected contracts
Prices are server-owned. Do not mutate balances, bypass FEFO, alter reservations
or issue browser-return grants.

## Outputs and evidence
Record catalog digest, expiry cases, concurrent reservation tests and replay-safe
grant/refund evidence.

## Recovery
Restore the prior catalog version and retain already-recorded ledger facts.

## Escalation
Any ledger, payment, refund or migration change requires an engineering change.
