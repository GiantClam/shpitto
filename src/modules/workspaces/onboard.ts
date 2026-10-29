import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import {getRuntimeProfile} from '../../config/env.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts} from '../../db/schema/billing.ts';
import {creditAccounts, workspaceMembers, workspaceSetups, workspaces} from '../../db/schema/workspace.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {executeDurableCommand} from '../shared/commands.ts';
import {issueDemoGrantInTransaction, type DemoFundingProfile} from '../credits/issue-demo.ts';
import {requireActiveVerifiedUser} from './policy.ts';
import {captureWorkspaceAttributionInTransaction} from '../affiliates/runtime.ts';
import type {ReferralTouch} from '../affiliates/contracts.ts';

export type OnboardingStatus = Readonly<{
  status: 'pending' | 'complete';
  workspaceId: string | null;
}>;

export type OnboardingResult = Readonly<{
  status: 'complete';
  workspaceId: string;
  created: boolean;
  replayed?: boolean;
  demoGrantId?: string;
  demoGrantReplayed?: boolean;
}>;

export type OnboardingOptions = Readonly<{
  referralTouch?: ReferralTouch | null;
  idempotencyKey?: string;
  fundDemoCredits?: boolean;
  profile?: DemoFundingProfile;
  now?: Date;
}>;

type OnboardingTx = TransactionDatabase;

function now(): Date {
  return new Date();
}

/** Creates the durable pending marker without creating funding or a workspace. */
export async function ensurePendingOnboarding(db: AppDatabase, userId: string): Promise<void> {
  const timestamp = now();
  await db.insert(workspaceSetups).values({
    id: randomUUID(),
    userId,
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing({target: workspaceSetups.userId});
}

async function completeInTransaction(
  tx: OnboardingTx,
  userId: string,
  workspaceName: string,
  options: OnboardingOptions,
): Promise<OnboardingResult> {
  const timestamp = now();
  await tx.insert(workspaceSetups).values({
    id: randomUUID(),
    userId,
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing({target: workspaceSetups.userId});

  const setupRows = await tx.select().from(workspaceSetups).where(eq(workspaceSetups.userId, userId)).limit(1);
  const setup = setupRows[0];
  if (!setup) throw new Error('Unable to create onboarding setup.');

  if (setup.status === 'complete' && setup.workspaceId) {
    if (!options.fundDemoCredits) return {status: 'complete', workspaceId: setup.workspaceId, created: false};
    await tx.insert(creditAccounts).values({
      workspaceId: setup.workspaceId,
      version: 0n,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).onConflictDoNothing();
    const demoGrant = await issueDemoGrantInTransaction(tx, {
      actorUserId: userId,
      workspaceId: setup.workspaceId,
      profile: options.profile ?? (getRuntimeProfile() === 'acceptance' ? 'test' : (getRuntimeProfile() === 'production' ? 'production' : 'local')),
      now: options.now,
    });
    return {status: 'complete', workspaceId: setup.workspaceId, created: false, demoGrantId: demoGrant.grantId, demoGrantReplayed: demoGrant.replayed};
  }

  const existingRows = await tx.select().from(workspaces).where(and(eq(workspaces.createdBy, userId), eq(workspaces.kind, 'personal'))).limit(1);
  const existingWorkspace = existingRows[0];
  let inserted = false;
  if (!existingWorkspace) {
    const insertedRows = await tx.insert(workspaces).values({
      id: randomUUID(),
      kind: 'personal',
      name: workspaceName,
      createdBy: userId,
      status: 'active',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).onConflictDoNothing().returning({id: workspaces.id});
    inserted = insertedRows.length > 0;
  }

  // A concurrent retry may have won the creator unique index. Always use the
  // committed row rather than the losing attempt's random UUID.
  const workspaceRows = await tx.select({id: workspaces.id}).from(workspaces)
    .where(and(eq(workspaces.createdBy, userId), eq(workspaces.kind, 'personal')))
    .limit(1);
  const workspaceId = workspaceRows[0]?.id;
  if (!workspaceId) throw new Error('Unable to resolve personal workspace.');
  if (inserted) await captureWorkspaceAttributionInTransaction(tx, {workspaceId, creatorUserId: userId, touch: options.referralTouch ?? null, now: timestamp});

  await tx.insert(workspaceMembers).values({
    workspaceId,
    userId,
    role: 'owner',
    createdAt: timestamp,
  }).onConflictDoNothing();

  await tx.insert(billingAccounts).values({
    workspaceId,
    status: 'active',
    holdReason: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();

  await tx.insert(creditAccounts).values({
    workspaceId,
    version: 0n,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();

  await tx.update(workspaceSetups)
    .set({workspaceId, status: 'complete', updatedAt: timestamp})
    .where(eq(workspaceSetups.userId, userId));

  if (!options.fundDemoCredits) return {status: 'complete', workspaceId, created: inserted};
  const demoGrant = await issueDemoGrantInTransaction(tx, {
    actorUserId: userId,
    workspaceId,
    profile: options.profile ?? (getRuntimeProfile() === 'acceptance' ? 'test' : (getRuntimeProfile() === 'production' ? 'production' : 'local')),
    now: options.now,
  });
  return {status: 'complete', workspaceId, created: inserted, demoGrantId: demoGrant.grantId, demoGrantReplayed: demoGrant.replayed};
}

/**
 * Idempotent personal workspace command. The unique creator index and setup
 * row make concurrent retries converge on one workspace and one membership.
 * The credit account is provisioned with the workspace; demo funding remains
 * an explicit profile-guarded option.
 */
export async function completePersonalWorkspaceOnboarding(
  db: AppDatabase,
  userId: string,
  workspaceName = 'Personal workspace',
  options: OnboardingOptions = {},
): Promise<OnboardingResult> {
  const normalizedName = workspaceName.trim();
  if (normalizedName.length < 1 || normalizedName.length > 100 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
    throw new DomainError('VALIDATION', 'workspaceName must be 1-100 characters without control characters.');
  }
  return inTransaction(db, async (tx) => {
    await requireActiveVerifiedUser(tx, userId);
    if (options.idempotencyKey === undefined) return completeInTransaction(tx, userId, normalizedName, options);
    const execution = await executeDurableCommand(tx, {
      actorUserId: userId,
      commandName: 'workspace.onboard-personal',
      idempotencyKey: options.idempotencyKey,
      payload: {workspaceName: normalizedName},
    }, () => completeInTransaction(tx, userId, normalizedName, options));
    return {...execution.value, replayed: execution.replayed};
  });
}

export async function getOnboardingStatus(db: AppDatabase, userId: string): Promise<OnboardingStatus> {
  const setupRows = await db.select().from(workspaceSetups).where(eq(workspaceSetups.userId, userId)).limit(1);
  const setup = setupRows[0];
  return {
    status: setup?.status === 'complete' && setup.workspaceId ? 'complete' : 'pending',
    workspaceId: setup?.workspaceId ?? null,
  };
}
