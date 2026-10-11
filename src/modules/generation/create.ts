import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import {assertCurrentServerQuote, type CatalogProfile, type ServerQuote} from '../../config/models.ts';
import {commandPayload, executeDurableCommand} from '../shared/commands.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {generationTasks} from '../../db/schema/generation.ts';
import {assets} from '../../db/schema/asset.ts';
import {billingAccounts} from '../../db/schema/billing.ts';
import {serializeJsonValue} from '../../contracts/http.ts';
import {reserveCreditsInTransaction, type ReservationInput} from '../credits/allocate.ts';
import {assertBillingOperationAllowed} from '../billing/hold-policy.ts';
import {authorizeWorkspaceAccess} from '../workspaces/authorize.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

const GENERATION_COMMAND = 'generation.create';
const QUEUE_BUDGET_MS = 10 * 60 * 1000;
const EXECUTION_BUDGET_MS = 60 * 60 * 1000;
const OVERALL_BUDGET_MS = 90 * 60 * 1000;

export type ReadyInputSnapshot = Readonly<{
  /** A server-authorized asset identity. Browser URLs are deliberately unsupported. */
  assetId?: string;
  assetWorkspaceId?: string;
  assetState?: 'ready';
  prompt?: string;
  options?: Readonly<Record<string, string | number | boolean>>;
}>;

export type GenerationPolicySnapshot = Readonly<{
  policyVersion: 1;
  queueBudgetSeconds: number;
  executionBudgetSeconds: number;
  overallBudgetSeconds: number;
}>;

export const DEFAULT_GENERATION_POLICY: GenerationPolicySnapshot = Object.freeze({
  policyVersion: 1,
  queueBudgetSeconds: QUEUE_BUDGET_MS / 1000,
  executionBudgetSeconds: EXECUTION_BUDGET_MS / 1000,
  overallBudgetSeconds: OVERALL_BUDGET_MS / 1000,
});

export type CreateGenerationInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  idempotencyKey: string;
  quote: ServerQuote;
  input: ReadyInputSnapshot;
  mode?: string;
  profile?: CatalogProfile;
  now?: Date;
  /** Trusted server-side resolver for asset readiness/ownership. Never supplied by a browser route. */
  authorizeReadyInput?: (tx: TransactionDatabase, actor: WorkspaceActor, workspaceId: string, input: ReadyInputSnapshot) => Promise<void>;
}>;

export type CreateGenerationResult = Readonly<{
  taskId: string;
  reservationId: string;
  workspaceId: string;
  status: 'queued';
  modelKey: string;
  quotedCredits: string;
  queueDeadlineAt: string;
  replayed?: boolean;
}>;

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${label} must be an object.`);
  }
}

function assertSafeText(value: string, label: string, maxLength: number): void {
  if (value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new DomainError('VALIDATION', `${label} is invalid.`);
  }
}

export function validateGenerationInputSnapshot(input: ReadyInputSnapshot, workspaceId: string): ReadyInputSnapshot {
  assertPlainObject(input, 'input');
  const forbiddenKeys = ['sourceUrl', 'providerUrl', 'providerParams', 'callbackUrl'];
  if (forbiddenKeys.some((key) => key in input)) {
    throw new DomainError('VALIDATION', 'Provider URLs and provider parameters are server-owned.');
  }
  const assetId = input.assetId;
  if (assetId !== undefined) {
    if (typeof assetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
      throw new DomainError('VALIDATION', 'input.assetId must be a UUID.');
    }
    if (input.assetWorkspaceId !== workspaceId || input.assetState !== 'ready') {
      throw new DomainError('FORBIDDEN', 'The input asset must be a ready asset owned by this workspace.');
    }
  }
  if (input.prompt !== undefined) {
    if (typeof input.prompt !== 'string') throw new DomainError('VALIDATION', 'input.prompt must be a string.');
    assertSafeText(input.prompt.trim(), 'input.prompt', 10_000);
  }
  if (assetId === undefined && (!input.prompt || input.prompt.trim().length === 0)) {
    throw new DomainError('VALIDATION', 'A ready input asset or non-empty prompt is required.');
  }
  if (input.options !== undefined) {
    assertPlainObject(input.options, 'input.options');
    if (Object.keys(input.options).length > 32) throw new DomainError('VALIDATION', 'input.options has too many entries.');
    for (const [key, value] of Object.entries(input.options)) {
      assertSafeText(key, 'input option key', 64);
      if (forbiddenKeys.includes(key)) throw new DomainError('VALIDATION', 'Provider URLs and provider parameters are server-owned.');
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new DomainError('VALIDATION', 'input.options contains an unsupported value.');
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new DomainError('VALIDATION', 'input.options contains a non-finite number.');
      }
    }
  }
  return Object.freeze(serializeJsonValue(input) as ReadyInputSnapshot);
}

function policySnapshot(): GenerationPolicySnapshot {
  return DEFAULT_GENERATION_POLICY;
}

function addMs(base: Date, milliseconds: number): Date {
  return new Date(base.getTime() + milliseconds);
}

async function assertGenerationAllowed(
  tx: TransactionDatabase,
  input: CreateGenerationInput,
): Promise<void> {
  await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
  const billingRows = await tx.select({status: billingAccounts.status})
    .from(billingAccounts)
    .where(eq(billingAccounts.workspaceId, input.workspaceId))
    .limit(1);
  const billing = billingRows[0];
  if (!billing) throw new DomainError('CONFLICT', 'The workspace has no billing account.');
  if (billing.status !== 'active' && billing.status !== 'hold') {
    throw new DomainError('CONFLICT', 'The workspace billing state is invalid.');
  }
  assertBillingOperationAllowed('generation', billing.status);
}

async function createInTransaction(
  tx: TransactionDatabase,
  input: CreateGenerationInput,
  taskId: string,
  inputSnapshot: ReadyInputSnapshot,
  policy: GenerationPolicySnapshot,
): Promise<CreateGenerationResult> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new DomainError('VALIDATION', 'A valid creation timestamp is required.');
  const profile = input.profile ?? 'local';
  const model = assertCurrentServerQuote(input.quote, profile);
  await assertGenerationAllowed(tx, input);
  if (inputSnapshot.assetId) {
    if (!input.authorizeReadyInput) {
      throw new DomainError('FORBIDDEN', 'A server-authorized ready input asset is required.');
    }
    // Retain readiness until the task reference commits; deletion takes the
    // conflicting asset lock before checking for active task references.
    const asset = (await tx.select({state: assets.state}).from(assets).where(and(
      eq(assets.id, inputSnapshot.assetId), eq(assets.workspaceId, input.workspaceId),
    )).for('share').limit(1))[0];
    if (!asset || asset.state !== 'ready') {
      throw new DomainError('FORBIDDEN', 'The input asset must be a ready asset owned by this workspace.');
    }
    await input.authorizeReadyInput(tx, input.actor, input.workspaceId, inputSnapshot);
  }

  const queueDeadlineAt = addMs(now, policy.queueBudgetSeconds * 1000);
  const reservationInput: ReservationInput = {
    actorUserId: input.actor.userId,
    workspaceId: input.workspaceId,
    taskId,
    idempotencyKey: input.idempotencyKey,
    quote: input.quote,
    commandName: GENERATION_COMMAND,
    profile,
    now,
  };
  await tx.insert(generationTasks).values({
    id: taskId,
    workspaceId: input.workspaceId,
    requestedBy: input.actor.userId,
    mode: input.mode ?? 'video',
    modelKey: model.id,
    catalogVersion: input.quote.catalogVersion,
    catalogSnapshot: serializeJsonValue(input.quote),
    inputSnapshot: serializeJsonValue(inputSnapshot),
    policySnapshot: serializeJsonValue(policy),
    quotedCredits: BigInt(input.quote.totalCost),
    status: 'queued',
    failureCode: null,
    deadlineAt: queueDeadlineAt,
    queueDeadlineAt,
    stageDeadlineAt: null,
    overallDeadlineAt: null,
    materializationAttempts: 0,
    nextActionAt: queueDeadlineAt,
    dispatchStartedAt: null,
    dispatchIdentity: null,
    providerCostState: null,
    providerCostMinor: null,
    providerCostCurrency: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const reservation = await reserveCreditsInTransaction(tx, reservationInput);
  return {
    taskId,
    reservationId: reservation.reservationId,
    workspaceId: input.workspaceId,
    status: 'queued',
    modelKey: model.id,
    quotedCredits: input.quote.totalCost,
    queueDeadlineAt: queueDeadlineAt.toISOString(),
  };
}

/** Persist the task, accepted snapshots, reservation, command result and dispatch outbox atomically. */
export async function createGenerationTask(
  db: AppDatabase,
  input: CreateGenerationInput,
): Promise<{value: CreateGenerationResult; replayed: boolean}> {
  const mode = input.mode ?? 'video';
  assertSafeText(mode, 'mode', 64);
  const inputSnapshot = validateGenerationInputSnapshot(input.input, input.workspaceId);
  const policy = policySnapshot();
  const payload = commandPayload({
    mode,
    quote: input.quote,
    input: inputSnapshot,
    policy,
  });
  return db.transaction(async (tx) => {
    // A durable result is private workspace data, including on idempotent replay.
    await authorizeWorkspaceAccess(tx, input.workspaceId, input.actor);
    return executeDurableCommand(tx, {
      actorUserId: input.actor.userId,
      workspaceId: input.workspaceId,
      commandName: GENERATION_COMMAND,
      idempotencyKey: input.idempotencyKey,
      payload,
    }, () => createInTransaction(tx, {...input, mode}, randomUUID(), inputSnapshot, policy));
  });
}
