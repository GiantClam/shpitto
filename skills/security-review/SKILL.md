# security-review

Review a bounded change for authorization, tenant isolation, secrets and unsafe imports.

## Inputs
- Baseline, dirty-work manifest, diff and applicable protected contracts.

## Allowed scope
Review findings, safe presentation fixes and scoped remediation evidence.

## Protected contracts
Do not weaken authentication, CSRF/same-origin checks, tenant predicates, private
downloads, webhook verification or validator policy.

## Outputs and evidence
Record findings, severity, affected paths, checks, residual risk and reviewer identity.

## Recovery
Apply only attributable remediation or produce a scoped patch; preserve unrelated changes.

## Escalation
P0/P1, secret exposure or protected contract changes block ordinary customization.
