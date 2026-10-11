# Operator owner bootstrap and credential recovery

This procedure is a server-only administrative entrypoint. There is no public bootstrap or recovery endpoint. Host login and database credentials are a separate authority from customer sessions. Complete the independent administrative host-access check and record its approved change-ticket reference before applying either action. Run only from the approved application host with its existing database environment; do not copy credentials into command arguments or tickets.

## Initial owner

Create and verify the intended identity using Better Auth first. Run `node --experimental-strip-types scripts/operator-owner.ts bootstrap --target-user-id USER_ID --reason "Initial administrative owner" --change-reference TICKET_ID` to validate the request without changing data. Add `--apply` to commit the grant and audit together. The advisory lock serializes competing initializations. Any prior role or bootstrap audit permanently closes this path, including after all roles are revoked.

The grant creates no session and no second-factor stamp. The operator must log in and complete the normal verified second-factor flow before privileged commands are available.

## Lost credentials

1. Independently authenticate to the administrative host and verify the requester, target identity and approved recovery ticket outside the affected web session. Preserve host-access logs with that ticket.
2. Recover the identity credentials using the configured Better Auth identity recovery procedure. This script does not set passwords, bypass email verification, fabricate second-factor evidence or grant a new person authority.
3. Inspect the existing superadmin role version. Validate with `node --experimental-strip-types scripts/operator-owner.ts recover --target-user-id USER_ID --expected-version VERSION --reason "Approved lost-credential recovery" --change-reference TICKET_ID`.
4. Add `--apply` only after the independent host-access and identity checks. Only an existing superadmin appointment can be restored. Account access, role restoration, removal of old sessions/step-up stamps and the recovery audit commit atomically. A stale version fails.
5. Require a new login and second-factor verification. Record the command result and the matching `operator.owner.recover` audit in the ticket, then close administrative access.

The audit identifies the target separately from the actual host principal and host name, and records the out-of-band authority and approved ticket. It does not claim a customer session authorized recovery. Do not use this procedure to recover historical balances or alter ledger history. Real-account execution remains deferred to the separately approved live verification stage.
