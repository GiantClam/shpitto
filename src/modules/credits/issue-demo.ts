import {DomainError} from '../../db/contracts.ts';
import type {AppDatabase} from '../../db/client.ts';
import {issueGrant, issueGrantInTransaction, type IssueGrantResult} from './ledger.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

export type DemoFundingProfile = 'local' | 'test' | 'production';

export type DemoFundingInput = Readonly<{
  actorUserId: string;
  workspaceId: string;
  profile?: DemoFundingProfile;
  amount?: bigint;
  now?: Date;
}>;

function assertPermitted(profile: DemoFundingProfile): void {
  if (profile === 'production') {
    throw new DomainError('FORBIDDEN', 'Demo funding is disabled in production.');
  }
}

function grantInput(input: DemoFundingInput) {
  const now = input.now ?? new Date();
  const amount = input.amount ?? 100n;
  return {
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    commandName: 'onboarding.issue-demo',
    commandKey: `onboarding-demo:${input.workspaceId}`,
    businessKey: `onboarding-demo:${input.workspaceId}`,
    source: 'demo' as const,
    amount,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    payload: {workspaceId: input.workspaceId, source: 'demo', amount: amount.toString(10)},
  };
}

export async function issueDemoGrant(db: AppDatabase, input: DemoFundingInput): Promise<IssueGrantResult> {
  const profile = input.profile ?? 'local';
  assertPermitted(profile);
  return issueGrant(db, grantInput(input));
}

export async function issueDemoGrantInTransaction(tx: TransactionDatabase, input: DemoFundingInput): Promise<IssueGrantResult> {
  const profile = input.profile ?? 'local';
  assertPermitted(profile);
  return issueGrantInTransaction(tx, grantInput(input));
}
