import {DomainError} from '../../db/contracts.ts';
import {isBillingHoldBlocking, type BillingAccountStatus} from '../billing/hold-policy.ts';

export type WorkspaceStatus = 'active' | 'suspended';

export type AccessOperation =
  | 'login'
  | 'session'
  | 'history'
  | 'download'
  | 'invitation'
  | 'transfer'
  | 'generation'
  | 'checkout'
  | 'portal'
  | 'support'
  | 'operator-read'
  | 'worker-delivery'
  | 'worker-settlement';

export type AccessPrincipal = Readonly<
  | {kind: 'member'; userId: string}
  | {kind: 'operator'; userId: string; audited: boolean}
  | {kind: 'worker'; workerId: string}
>;

export type AccessState = Readonly<{
  userDisabled: boolean;
  workspaceStatus: WorkspaceStatus;
  billingStatus: BillingAccountStatus;
}>;

export type AccessDecision = Readonly<{
  allowed: boolean;
  reason: 'user-disabled' | 'workspace-suspended' | 'billing-hold' | 'operator-audit-required' | 'principal-not-allowed' | null;
}>;

const SUSPENDED_MEMBER_OPERATIONS = new Set<AccessOperation>([
  'history',
  'download',
  'invitation',
  'transfer',
  'generation',
  'checkout',
  'portal',
  'support',
]);

function deny(reason: Exclude<AccessDecision['reason'], null>): AccessDecision {
  return {allowed: false, reason};
}

export function evaluateAccess(
  state: AccessState,
  principal: AccessPrincipal,
  operation: AccessOperation,
): AccessDecision {
  if (principal.kind === 'worker') {
    return operation === 'worker-delivery' || operation === 'worker-settlement'
      ? {allowed: true, reason: null}
      : deny('principal-not-allowed');
  }

  if (principal.kind === 'operator') {
    if (operation === 'operator-read' && principal.audited && !state.userDisabled) {
      return {allowed: true, reason: null};
    }
    return operation === 'operator-read' ? deny('operator-audit-required') : deny('principal-not-allowed');
  }

  if (operation === 'operator-read' || operation === 'worker-delivery' || operation === 'worker-settlement') {
    return deny('principal-not-allowed');
  }
  if (state.userDisabled) return deny('user-disabled');
  if (state.workspaceStatus === 'suspended' && SUSPENDED_MEMBER_OPERATIONS.has(operation)) {
    return deny('workspace-suspended');
  }
  const billingOperation = operation === 'generation' || operation === 'checkout'
    ? operation
    : null;
  if (billingOperation && isBillingHoldBlocking(billingOperation, state.billingStatus)) {
    return deny('billing-hold');
  }
  return {allowed: true, reason: null};
}

export function assertAccessAllowed(
  state: AccessState,
  principal: AccessPrincipal,
  operation: AccessOperation,
): void {
  const decision = evaluateAccess(state, principal, operation);
  if (decision.allowed) return;
  const messages = {
    'user-disabled': 'This account is disabled.',
    'workspace-suspended': 'This workspace is suspended.',
    'billing-hold': `Billing hold blocks ${operation}.`,
    'operator-audit-required': 'An audited operator read is required.',
    'principal-not-allowed': 'This principal cannot perform the requested operation.',
  } as const;
  throw new DomainError('FORBIDDEN', messages[decision.reason!]);
}
