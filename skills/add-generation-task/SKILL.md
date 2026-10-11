# add-generation-task

Add a declared generation task only after its domain and adapter contracts are reviewed.

## Inputs
- Versioned task DTO, input/output MIME policy, provider capability and credit impact.

## Allowed scope
Task declarations, presentation forms and isolated task contract fixtures.

## Protected contracts
Do not bypass the guarded state machine, reservation, ownership checks, durable
asset validation or terminal settlement.

## Outputs and evidence
Record DTO compatibility, state transitions, credit reservation/refund behavior,
asset ownership and failure/recovery results.

## Recovery
Roll back the task declaration and its scoped fixtures; never rewrite historical
task or ledger facts.

## Escalation
Any change to state, credits, storage or migrations is an engineering change.
