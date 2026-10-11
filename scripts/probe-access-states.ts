import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {userAccessControls} from '../src/db/schema/access.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {creditAccounts, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';
import {disableUser, placeBillingHold, releaseBillingHold, restoreUser, resumeWorkspace, suspendWorkspace} from '../src/modules/operations/status-commands.ts';
import {evaluateAccess, assertAccessAllowed, type AccessState} from '../src/modules/workspaces/access-state.ts';
import {authorizeWorkspaceAccess} from '../src/modules/workspaces/authorize.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {cancelGenerationTask, claimDispatch, markGenerationMaterializing, markSubmissionUnknown, reconcileSubmissionUnknown, recordProviderSubmission, settleGenerationTask} from '../src/modules/generation/lifecycle.ts';

const suffix = randomUUID();
const users = {
  owner: `access-state-owner-${suffix}`,
  member: `access-state-member-${suffix}`,
  operator: `access-state-operator-${suffix}`,
};
const sessions = {
  owner: `access-state-owner-session-${suffix}`,
  member: `access-state-member-session-${suffix}`,
  operator: `access-state-operator-session-${suffix}`,
};

function forbidden(result: PromiseSettledResult<unknown>): boolean {
  return result.status === 'rejected' && result.reason instanceof DomainError && result.reason.code === 'FORBIDDEN';
}

function state(overrides: Partial<AccessState> = {}): AccessState {
  return {
    userDisabled: false,
    workspaceStatus: 'active',
    billingStatus: 'active',
    ...overrides,
  };
}

async function migrateDatabase(): Promise<void> {
  const client = createMigrationClient();
  await client.connect();
  try {
    await migrate(drizzle(client), {migrationsFolder: 'src/db/migrations'});
  } finally {
    await client.end();
  }
}

async function run(): Promise<void> {
  await migrateDatabase();
  const database = createDatabase({max: 8});
  const workspaceId = randomUUID();
  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60 * 1000);
  const operatorActor = {userId: users.operator, sessionId: sessions.operator};

  try {
    await database.db.insert(authUser).values([
      {id: users.owner, name: 'Access state owner', email: `${users.owner}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: users.member, name: 'Access state member', email: `${users.member}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: users.operator, name: 'Access state operator', email: `${users.operator}@example.test`, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(authSession).values([
      {id: sessions.owner, userId: users.owner, token: `${sessions.owner}-token`, expiresAt: expiry, createdAt: now, updatedAt: now},
      {id: sessions.member, userId: users.member, token: `${sessions.member}-token`, expiresAt: expiry, createdAt: now, updatedAt: now},
      {id: sessions.operator, userId: users.operator, token: `${sessions.operator}-token`, expiresAt: expiry, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(workspaces).values({
      id: workspaceId,
      kind: 'team',
      name: 'Access state workspace',
      createdBy: users.owner,
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await database.db.insert(workspaceMembers).values([
      {workspaceId, userId: users.owner, role: 'owner', createdAt: now},
      {workspaceId, userId: users.member, role: 'member', createdAt: now},
    ]);
    await database.db.insert(billingAccounts).values({
      workspaceId,
      status: 'active',
      holdReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await database.db.insert(operatorRoles).values({userId: users.operator, role: 'operator', grantedAt: now, updatedAt: now});
    await recordTrustedSecondFactor(database.db, operatorActor, now);

    const rejectsCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;
    await assert.rejects(disableUser(database.db, operatorActor, ' ', 'Valid reason'), rejectsCode('VALIDATION'));
    for (const reason of ['x', 'x'.repeat(501), 'bad\nreason']) {
      await assert.rejects(disableUser(database.db, operatorActor, users.member, reason), rejectsCode('VALIDATION'));
    }
    await assert.rejects(disableUser(database.db, operatorActor, `missing-${suffix}`, 'Missing user'), rejectsCode('NOT_FOUND'));
    await assert.rejects(restoreUser(database.db, operatorActor, `missing-${suffix}`, 'Missing user'), rejectsCode('NOT_FOUND'));
    await assert.rejects(suspendWorkspace(database.db, operatorActor, randomUUID(), 'Missing workspace'), rejectsCode('NOT_FOUND'));
    await assert.rejects(placeBillingHold(database.db, operatorActor, randomUUID(), 'Missing workspace'), rejectsCode('NOT_FOUND'));
    assert.deepEqual(await restoreUser(database.db, operatorActor, users.member, 'Already active'), {changed: false, version: 1});
    assert.deepEqual(await resumeWorkspace(database.db, operatorActor, workspaceId, 'Already active'), {changed: false, version: 1});
    assert.deepEqual(await releaseBillingHold(database.db, operatorActor, workspaceId, 'Already active'), {changed: false, version: 1});

    const disabledPolicy = evaluateAccess(state({userDisabled: true}), {kind: 'member', userId: users.member}, 'history');
    assert(!disabledPolicy.allowed && disabledPolicy.reason === 'user-disabled', 'Disabled member history was allowed.');
    const teammateBefore = await authorizeWorkspaceAccess(database.db, workspaceId, {userId: users.owner, sessionId: sessions.owner});
    assert(teammateBefore.membership.role === 'owner', 'Active teammate lost access before disablement.');

    await disableUser(database.db, operatorActor, users.member, 'Access-state probe disablement');
    assert.deepEqual(await disableUser(database.db, operatorActor, users.member, 'Repeated disablement'), {changed: false, version: 2});
    const disabledControl = (await database.db.select({status: userAccessControls.status}).from(userAccessControls).where(eq(userAccessControls.userId, users.member)).limit(1))[0];
    assert(disabledControl?.status === 'disabled', 'Domain user access control was not persisted.');
    const disabledRequest = await Promise.allSettled([
      authorizeWorkspaceAccess(database.db, workspaceId, {userId: users.member, sessionId: sessions.member}),
    ]);
    assert(forbidden(disabledRequest[0]!), 'Disabled member retained current-session access.');
    const memberSessions = await database.db.select({id: authSession.id}).from(authSession).where(eq(authSession.userId, users.member));
    assert(memberSessions.length === 0, 'Disabled member sessions were not revoked.');
    const teammateAfter = await authorizeWorkspaceAccess(database.db, workspaceId, {userId: users.owner, sessionId: sessions.owner});
    assert(teammateAfter.membership.role === 'owner', 'Disabling one member harmed another member.');

    await suspendWorkspace(database.db, operatorActor, workspaceId, 'Access-state probe suspension');
    assert.deepEqual(await suspendWorkspace(database.db, operatorActor, workspaceId, 'Repeated suspension'), {changed: false, version: 2});
    const suspendedRequest = await Promise.allSettled([
      authorizeWorkspaceAccess(database.db, workspaceId, {userId: users.owner, sessionId: sessions.owner}),
    ]);
    assert(forbidden(suspendedRequest[0]!), 'Suspended workspace member access was allowed.');
    assert(evaluateAccess(state({workspaceStatus: 'suspended'}), {kind: 'operator', userId: users.operator, audited: true}, 'operator-read').allowed, 'Audited operator read was denied during suspension.');
    assert(evaluateAccess(state({workspaceStatus: 'suspended'}), {kind: 'worker', workerId: 'worker-1'}, 'worker-settlement').allowed, 'Worker settlement was denied during suspension.');
    await resumeWorkspace(database.db, operatorActor, workspaceId, 'Access-state probe resume');
    assert.equal((await authorizeWorkspaceAccess(database.db, workspaceId, {userId: users.owner})).workspace.status, 'active');

    await placeBillingHold(database.db, operatorActor, workspaceId, 'Access-state probe billing hold');
    assert.deepEqual(await placeBillingHold(database.db, operatorActor, workspaceId, 'Access-state probe billing hold'), {changed: false, version: 2});
    const heldAccount = (await database.db.select({status: billingAccounts.status}).from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)).limit(1))[0];
    assert(heldAccount?.status === 'hold', 'Billing hold was not persisted.');
    const heldState = state({billingStatus: 'hold'});
    assert(!evaluateAccess(heldState, {kind: 'member', userId: users.owner}, 'generation').allowed, 'Billing hold allowed new generation.');
    assert(!evaluateAccess(heldState, {kind: 'member', userId: users.owner}, 'checkout').allowed, 'Billing hold allowed Checkout.');
    for (const operation of ['history', 'download', 'invitation', 'portal', 'support'] as const) {
      assert(evaluateAccess(heldState, {kind: 'member', userId: users.owner}, operation).allowed, `Billing hold blocked allowed operation: ${operation}.`);
    }
    assert(evaluateAccess(heldState, {kind: 'worker', workerId: 'worker-1'}, 'worker-settlement').allowed, 'Worker settlement was denied during billing hold.');
    assertAccessAllowed(heldState, {kind: 'member', userId: users.owner}, 'history');

    for (const [principal, operation] of [
      [{kind: 'worker', workerId: 'worker-1'}, 'generation'],
      [{kind: 'operator', userId: users.operator, audited: false}, 'operator-read'],
      [{kind: 'operator', userId: users.operator, audited: true}, 'generation'],
    ] as const) {
      assert.throws(() => assertAccessAllowed(heldState, principal, operation), rejectsCode('FORBIDDEN'));
    }
    assert.throws(() => assertAccessAllowed(heldState, {kind: 'member', userId: users.owner}, 'generation'), rejectsCode('FORBIDDEN'));
    assert.throws(() => assertAccessAllowed(state({userDisabled: true}), {kind: 'member', userId: users.member}, 'session'), rejectsCode('FORBIDDEN'));
    assert.throws(() => assertAccessAllowed(state({workspaceStatus: 'suspended'}), {kind: 'member', userId: users.owner}, 'download'), rejectsCode('FORBIDDEN'));
    assert.equal(evaluateAccess(state({userDisabled: true}), {kind: 'operator', userId: users.operator, audited: true}, 'operator-read').allowed, false);
    assertAccessAllowed(state({userDisabled: true, workspaceStatus: 'suspended', billingStatus: 'hold'}), {kind: 'worker', workerId: 'worker-1'}, 'worker-delivery');

    assert.deepEqual(await releaseBillingHold(database.db, operatorActor, workspaceId, 'Resolved billing hold'), {changed: true, version: 3});
    const released = (await database.db.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)))[0]!;
    assert.equal(released.status, 'active');
    assert.equal(released.holdReason, null);
    assert.deepEqual(await restoreUser(database.db, operatorActor, users.member, 'Resolved disablement'), {changed: true, version: 3});
    const restored = (await database.db.select().from(userAccessControls).where(eq(userAccessControls.userId, users.member)))[0]!;
    assert.equal(restored.status, 'active');
    assert.equal(restored.disabledAt, null);
    assert.equal(restored.reason, null);
    assert.equal((await database.db.select().from(authUser).where(eq(authUser.id, users.member)))[0]!.disabledAt, null);
    assert.equal((await database.db.select().from(authSession).where(eq(authSession.userId, users.member))).length, 0, 'Restoring access must not revive revoked sessions.');
    assert.equal((await authorizeWorkspaceAccess(database.db, workspaceId, {userId: users.member})).membership.role, 'member');

    await database.db.insert(creditAccounts).values({workspaceId, version: 0n, createdAt: now, updatedAt: now});
    await issueGrant(database.db, {actorUserId: users.owner, workspaceId, commandName: 'probe.access-replay-grant', commandKey: suffix, businessKey: `access-replay-${suffix}`, source: 'manual', amount: 1000n, payload: {amount: '1000'}});
    const actor = {userId: users.member};
    const quote = createServerQuote(DEFAULT_MODEL_ID, '1', {now});
    const createInput = {actor, workspaceId, idempotencyKey: 'access-replay-create', quote, input: {prompt: 'private replay evidence'}, now};
    const created = await createGenerationTask(database.db, createInput);
    const claimInput = {actor, workspaceId, taskId: created.value.taskId, idempotencyKey: 'access-replay-claim', now};
    const claimed = await claimDispatch(database.db, claimInput);
    const unknownInput = {...claimInput, attemptId: claimed.value.attemptId, idempotencyKey: 'access-replay-unknown'};
    await markSubmissionUnknown(database.db, unknownInput);
    const reconcileInput = {...unknownInput, idempotencyKey: 'access-replay-reconcile', observation: 'found' as const, providerRequestId: 'access-replay-provider'};
    await reconcileSubmissionUnknown(database.db, reconcileInput);
    const materializeInput = {...unknownInput, idempotencyKey: 'access-replay-materialize'};
    await markGenerationMaterializing(database.db, materializeInput);
    const settleInput = {...claimInput, idempotencyKey: 'access-replay-settle', outcome: 'failed' as const, failureCode: 'generation.probe_failed'};
    await settleGenerationTask(database.db, settleInput);
    const cancelledTask = await createGenerationTask(database.db, {...createInput, idempotencyKey: 'access-replay-cancel-create'});
    const cancelInput = {actor, workspaceId, taskId: cancelledTask.value.taskId, idempotencyKey: 'access-replay-cancel', now};
    await cancelGenerationTask(database.db, cancelInput);
    const submittedTask = await createGenerationTask(database.db, {...createInput, idempotencyKey: 'access-replay-submit-create'});
    const submittedClaim = await claimDispatch(database.db, {...claimInput, taskId: submittedTask.value.taskId, idempotencyKey: 'access-replay-submit-claim'});
    const submitInput = {actor, workspaceId, taskId: submittedTask.value.taskId, attemptId: submittedClaim.value.attemptId, providerRequestId: 'access-replay-submitted', idempotencyKey: 'access-replay-submit', now};
    await recordProviderSubmission(database.db, submitInput);

    const replays = [
      ['create', () => createGenerationTask(database.db, createInput)],
      ['claim', () => claimDispatch(database.db, claimInput)],
      ['cancel', () => cancelGenerationTask(database.db, cancelInput)],
      ['unknown', () => markSubmissionUnknown(database.db, unknownInput)],
      ['reconcile', () => reconcileSubmissionUnknown(database.db, reconcileInput)],
      ['materialize', () => markGenerationMaterializing(database.db, materializeInput)],
      ['settle', () => settleGenerationTask(database.db, settleInput)],
      ['submit', () => recordProviderSubmission(database.db, submitInput)],
    ] as const;
    for (const [label, replay] of replays) assert.equal((await replay()).replayed, true, `Authorized ${label} replay is stable.`);
    const snapshot = async () => {
      const state: Record<string, unknown> = {};
      for (const table of ['generation_tasks', 'submission_attempts', 'credit_reservations', 'credit_grants', 'credit_ledger_entries', 'command_results', 'outbox_events']) {
        state[table] = (await database.pool.query(`select jsonb_agg(to_jsonb(t) order by t.id)::text as snapshot from app.${table} t where workspace_id = $1`, [workspaceId])).rows;
      }
      return state;
    };
    await database.db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, users.member)));
    const beforeRejectedReplays = await snapshot();
    for (const [label, replay] of replays) await assert.rejects(replay, rejectsCode('FORBIDDEN'), `Removed member must not receive cached ${label} results.`);
    assert.deepEqual(await snapshot(), beforeRejectedReplays, 'Denied replays must not mutate task, credit, command or dispatch state.');
    await suspendWorkspace(database.db, operatorActor, workspaceId, 'Replay probe suspension');
    assert.equal((await settleGenerationTask(database.db, {...settleInput, internalWorker: true})).replayed, true, 'Trusted worker replay remains available after membership removal and suspension.');
    const workerSettlement = await settleGenerationTask(database.db, {...settleInput, taskId: submittedTask.value.taskId, idempotencyKey: 'access-worker-continuation', internalWorker: true});
    assert.equal(workerSettlement.value.status, 'failed', 'An in-flight worker can settle after suspension and member removal.');
    await resumeWorkspace(database.db, operatorActor, workspaceId, 'Replay probe resume');
    await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId));
    assert.deepEqual(await placeBillingHold(database.db, operatorActor, workspaceId, 'Create missing billing projection'), {changed: true, version: 1});
    assert.equal((await database.db.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)))[0]!.holdReason, 'Create missing billing projection');

    console.log(JSON.stringify({
      status: 'PASS',
      disabledUserDenied: true,
      sessionsRevoked: true,
      teammateUnaffected: true,
      suspendedMemberDenied: true,
      operatorAuditAllowed: true,
      billingHoldGenerationCheckoutDenied: true,
      billingHoldAllowedReadsInvitesPortalSupport: true,
      workerSettlementPreserved: true,
      removedMemberReplayDenied: replays.map(([label]) => label),
      rejectedReplayStateUnchanged: true,
      suspendedRemovedMemberWorkerContinues: true,
    }));
  } finally {
    for (const table of ['generation_quarantine', 'submission_attempts', 'assets', 'command_results', 'outbox_events', 'audit_events', 'credit_ledger_entries', 'credit_allocations']) {
      await database.pool.query(`delete from app.${table} where workspace_id = $1`, [workspaceId]);
    }
    await database.pool.query('update app.credit_reservations set task_id = null where workspace_id = $1', [workspaceId]);
    for (const table of ['generation_tasks', 'credit_reservations', 'credit_grants', 'credit_accounts']) {
      await database.pool.query(`delete from app.${table} where workspace_id = $1`, [workspaceId]);
    }
    await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId));
    await database.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await database.db.delete(authUser).where(eq(authUser.id, users.owner));
    await database.db.delete(authUser).where(eq(authUser.id, users.member));
    // Account-wide commands now audit without a workspace. Remove only this
    // disposable fixture actor's records before deleting its auth row.
    await database.pool.query('delete from app.audit_events where actor_user_id = $1 and workspace_id is null', [users.operator]);
    await database.pool.query('delete from app.command_results where actor_user_id = $1 and workspace_id is null', [users.operator]);
    await database.db.delete(authUser).where(eq(authUser.id, users.operator));
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
