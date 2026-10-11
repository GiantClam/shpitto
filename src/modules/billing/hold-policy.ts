import {DomainError} from '../../db/contracts.ts';

export type BillingAccountStatus = 'active' | 'hold';

export type BillingOperation = 'generation' | 'checkout' | 'history' | 'download' | 'invitation' | 'portal' | 'support';

export function isBillingHoldBlocking(operation: BillingOperation, status: BillingAccountStatus): boolean {
  return status === 'hold' && (operation === 'generation' || operation === 'checkout');
}

export function assertBillingOperationAllowed(operation: BillingOperation, status: BillingAccountStatus): void {
  if (isBillingHoldBlocking(operation, status)) {
    throw new DomainError('FORBIDDEN', `Billing hold blocks ${operation}.`);
  }
}
