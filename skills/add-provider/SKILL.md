# add-provider

Propose a versioned generation provider adapter without changing the domain owner.

## Inputs
- Provider capability, model/version, input/output schema and callback contract.
- Cost, timeout, retry, polling and output retention information.

## Allowed scope
Provider adapter ports, versioned provider schemas and isolated contract tests.

## Protected contracts
Adapters cannot decide credits, authorization, terminal outcomes or retry a
paid submission after an ambiguous response.

## Outputs and evidence
Produce a capability matrix, safe submit/reconcile probes, webhook verification
cases, cost-unknown handling and crash/recovery evidence.

## Recovery
Revert only the provider change patch; keep unrelated work and existing provider
records intact.

## Escalation
Changes to generation states, credits, migrations or public API require an
engineering change with regression evidence.
