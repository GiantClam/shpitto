import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {and, eq} from 'drizzle-orm';

import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {assets} from '../src/db/schema/asset.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {commandResults} from '../src/db/schema/commands.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../src/db/schema/credit.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {generationQuarantine, generationTasks, providerWebhookInbox, submissionAttempts} from '../src/db/schema/generation.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {creditAccounts, creditGrants, creditReservations, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';
import {readAdminRecovery, replayAdminProviderWebhook, runAdminRecoverySweep} from '../src/modules/operations/recovery.ts';

// All fixtures are rolled back, including access audit rows. No provider calls.
const rollback = new Error('Rollback successful recovery probe fixtures');
const database = createDatabase();
try {
  await database.db.transaction(async (tx) => {
    const now = new Date();
    const userId = `m6-recovery-${randomUUID()}`;
    const sessionId = randomUUID();
    const actor = {userId, sessionId};
    await tx.insert(authUser).values({id: userId, name: 'Recovery probe', email: `${userId}@example.test`, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now});
    await tx.insert(authSession).values({id: sessionId, userId, token: randomUUID(), expiresAt: new Date(now.getTime() + 3600000), createdAt: now, updatedAt: now});
    await tx.insert(operatorRoles).values({userId, role: 'operator', grantedAt: now, updatedAt: now});
    await recordTrustedSecondFactor(tx, actor, now);
    const ids = [randomUUID(), randomUUID()];
    const taskIds = [randomUUID(), randomUUID()];
    const requestId = randomUUID();
    const nonces = [randomUUID(), randomUUID()];
    for (const [i, workspaceId] of ids.entries()) {
      await tx.insert(workspaces).values({id: workspaceId, kind: 'team', name: 'Recovery probe', createdBy: userId, createdAt: now, updatedAt: now});
      await tx.insert(generationTasks).values({id: taskIds[i]!, workspaceId, requestedBy: userId, mode: 't2v', modelKey: 'recovery-fixture', catalogVersion: 1, catalogSnapshot: {}, inputSnapshot: {}, policySnapshot: {}, quotedCredits: 1n, status: 'running', deadlineAt: now, queueDeadlineAt: now, nextActionAt: now, createdAt: now, updatedAt: now});
      await tx.insert(submissionAttempts).values({id: randomUUID(), taskId: taskIds[i]!, workspaceId, attemptNo: 1, provider: i === 0 ? 'replicate' : 'fal', clientReference: nonces[i]!, providerRequestId: requestId, state: 'running', startedAt: now, reconcileDeadline: now});
    }
    await tx.insert(providerWebhookInbox).values([
      {id: randomUUID(), provider: 'replicate', externalEventId: randomUUID(), attemptNonce: nonces[0]!, providerRequestId: requestId, payloadHash: 'a'.repeat(64), payload: {}, status: 'processed', receivedAt: now},
      {id: randomUUID(), provider: 'fal', externalEventId: randomUUID(), attemptNonce: nonces[1]!, providerRequestId: requestId, payloadHash: 'b'.repeat(64), payload: {}, status: 'failed', receivedAt: now},
      {id: randomUUID(), provider: 'replicate', externalEventId: randomUUID(), attemptNonce: randomUUID(), providerRequestId: requestId, payloadHash: 'c'.repeat(64), payload: {}, status: 'failed', receivedAt: now},
    ]);
    const view = await readAdminRecovery(tx as unknown as Parameters<typeof readAdminRecovery>[0], {actor, workspaceId: ids[0]!, purpose: 'Verify provider and tenant isolation'});
    assert.deepEqual(view.webhookInbox.map(({provider, status}) => ({provider, status})), [{provider: 'replicate', status: 'processed'}], 'Recovery must match provider, request and attempt nonce, not just provider request ID.');
    assert.equal(view.webhookInbox[0]!.taskId, taskIds[0]);
    assert.ok(view.modelHealth.some((model) => model.provider === 'replicate' && model.configuration === 'live_disabled' && model.observation.status === 'unavailable'));
    const foreign = await readAdminRecovery(tx as unknown as Parameters<typeof readAdminRecovery>[0], {actor, workspaceId: ids[0]!, purpose: 'Verify foreign task isolation', taskIds: [taskIds[1]!]});
    assert.equal(foreign.tasks.length, 0);
    assert.equal(foreign.webhookInbox.length, 0);
    // No generation is due in the command-envelope checks below.
    await tx.update(generationTasks).set({deadlineAt: new Date(now.getTime() + 3600000)}).where(eq(generationTasks.workspaceId, ids[0]!));
    const sweepInput = {actor, workspaceId: ids[0]!, purpose: 'Reconcile overdue fixture tasks', expectedVersion: 1, idempotencyKey: randomUUID(), now};
    const commandDb = tx as unknown as Parameters<typeof runAdminRecoverySweep>[0];
    const first = await runAdminRecoverySweep(commandDb, sweepInput);
    const replay = await runAdminRecoverySweep(commandDb, sweepInput);
    assert.deepEqual(first, {scanned: 0, failed: 0, version: 2, replayed: false});
    assert.deepEqual(replay, {...first, replayed: true});
    await assert.rejects(() => runAdminRecoverySweep(commandDb, {...sweepInput, idempotencyKey: randomUUID()}), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    await assert.rejects(() => runAdminRecoverySweep(commandDb, {...sweepInput, purpose: 'Different command semantics'}), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    assert.equal((await tx.select().from(commandResults).where(eq(commandResults.workspaceId, ids[0]!))).length, 1);
    assert.equal((await tx.select().from(auditEvents).where(eq(auditEvents.workspaceId, ids[0]!))).length, 1);
    assert.equal((await tx.select().from(outboxEvents).where(eq(outboxEvents.workspaceId, ids[0]!))).length, 1);
    const workspaceId = ids[0]!;
    await tx.insert(workspaceMembers).values({workspaceId, userId, role: 'owner', createdAt: now});
    await tx.insert(billingAccounts).values({workspaceId, status: 'active', version: 1, createdAt: now, updatedAt: now});
    await tx.insert(creditAccounts).values({workspaceId, version: 0n, createdAt: now, updatedAt: now});
    await issueGrant(commandDb, {actorUserId: userId, workspaceId, commandName: 'probe.recovery-fund', commandKey: randomUUID(), businessKey: randomUUID(), source: 'manual', amount: 100n, expiresAt: null, payload: {credits: '100'}});
    const {value: generation} = await createGenerationTask(commandDb, {actor, workspaceId, idempotencyKey: randomUUID(), quote: createServerQuote(DEFAULT_MODEL_ID, '2', {now}), input: {prompt: 'Recovery rollback fixture'}, now});
    await tx.update(generationTasks).set({deadlineAt: now}).where(eq(generationTasks.id, generation.taskId));
    const conflictAuditId = randomUUID();
    const dueInput = {...sweepInput, expectedVersion: 2, idempotencyKey: randomUUID()};
    await tx.insert(auditEvents).values({id: conflictAuditId, actorUserId: userId, workspaceId, commandName: 'operator.recovery.sweep', commandKey: dueInput.idempotencyKey, semanticHash: '0'.repeat(64), payload: {}, createdAt: now});
    await assert.rejects(() => runAdminRecoverySweep(commandDb, dueInput), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    const taskAfterRollback = (await tx.select().from(generationTasks).where(eq(generationTasks.id, generation.taskId)))[0]!;
    const reservationAfterRollback = (await tx.select().from(creditReservations).where(eq(creditReservations.id, generation.reservationId)))[0]!;
    assert.equal(taskAfterRollback.status, 'queued', 'Audit failure must roll back deadline settlement.');
    assert.equal(reservationAfterRollback.status, 'active');
    assert.equal((await tx.select().from(commandResults).where(and(eq(commandResults.workspaceId, workspaceId), eq(commandResults.idempotencyKey, dueInput.idempotencyKey)))).length, 0);
    await tx.delete(auditEvents).where(eq(auditEvents.id, conflictAuditId));
    const settled = await runAdminRecoverySweep(commandDb, dueInput);
    assert.equal(settled.failed, 1);
    assert.equal((await runAdminRecoverySweep(commandDb, dueInput)).replayed, true);
    assert.equal((await tx.select().from(generationTasks).where(eq(generationTasks.id, generation.taskId)))[0]!.status, 'failed');
    assert.equal((await tx.select().from(creditReservations).where(eq(creditReservations.id, generation.reservationId)))[0]!.status, 'released');
    const grantAfter = (await tx.select().from(creditGrants).where(eq(creditGrants.workspaceId, workspaceId)))[0]!;
    assert.equal(grantAfter.available, 100n);
    assert.equal(grantAfter.reserved, 0n);
    const attemptId = randomUUID();
    const inboxId = randomUUID();
    const nonce = randomUUID();
    const providerRequestId = 'safe-replay-' + randomUUID();
    const externalEventId = randomUUID();
    await tx.insert(submissionAttempts).values({id: attemptId, taskId: generation.taskId, workspaceId, attemptNo: 1, provider: 'replicate', clientReference: nonce, providerRequestId, state: 'failed', startedAt: now, reconcileDeadline: now});
    await tx.insert(providerWebhookInbox).values({id: inboxId, provider: 'replicate', externalEventId, attemptNonce: nonce, providerRequestId, payloadHash: 'd'.repeat(64), payload: {status: 'failed', providerRequestId, attemptNonce: nonce, authenticatedAt: now.toISOString()}, status: 'received', receivedAt: now});
    await tx.insert(assets).values({id: randomUUID(), workspaceId, taskId: generation.taskId, purpose: 'output', state: 'quarantined', objectKey: 'private/recovery-object-key', createdBy: userId, createdAt: now, updatedAt: now});
    const recovery = await readAdminRecovery(commandDb, {actor, workspaceId, purpose: 'Inspect bounded stored delivery evidence', taskIds: [generation.taskId]});
    assert.equal(recovery.assets[0]!.taskId, generation.taskId);
    assert.ok(recovery.outbox.some((event) => event.taskId === generation.taskId && event.eventType === 'generation.dispatch'));
    assert.equal(recovery.webhookInbox[0]!.attemptId, attemptId);
    assert.ok(!JSON.stringify(recovery).includes('private/recovery-object-key'));
    assert.ok(!JSON.stringify(recovery).includes(providerRequestId));
    assert.equal(recovery.providerCostStates.unknown, 1);
    const retryInput = {actor, workspaceId, inboxId, purpose: 'Replay verified stored notification after processing interruption', expectedVersion: settled.version, idempotencyKey: randomUUID(), now};
    const failureAuditId = randomUUID();
    await tx.insert(auditEvents).values({id: failureAuditId, actorUserId: userId, workspaceId, commandName: 'operator.recovery.webhook-replay', commandKey: retryInput.idempotencyKey, semanticHash: '0'.repeat(64), payload: {}, createdAt: now});
    await assert.rejects(() => replayAdminProviderWebhook(commandDb, retryInput), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    assert.equal((await tx.select().from(providerWebhookInbox).where(eq(providerWebhookInbox.id, inboxId)))[0]!.status, 'received');
    assert.equal((await tx.select().from(generationQuarantine).where(eq(generationQuarantine.taskId, generation.taskId))).length, 0);
    await tx.delete(auditEvents).where(eq(auditEvents.id, failureAuditId));
    const ledgerBefore = (await tx.select().from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, workspaceId))).length;
    const attemptsBefore = (await tx.select().from(submissionAttempts).where(eq(submissionAttempts.workspaceId, workspaceId))).length;
    const originalTaskVersion = (await tx.select().from(generationTasks).where(eq(generationTasks.id, generation.taskId)))[0]!.version;
    const replayed = await replayAdminProviderWebhook(commandDb, retryInput);
    assert.equal(replayed.status, 'quarantined');
    assert.deepEqual(await replayAdminProviderWebhook(commandDb, retryInput), {...replayed, replayed: true});
    await assert.rejects(() => replayAdminProviderWebhook(commandDb, {...retryInput, purpose: 'Different recovery semantics'}), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    await assert.rejects(() => replayAdminProviderWebhook(commandDb, {...retryInput, idempotencyKey: randomUUID()}), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    const foreignInbox = (await tx.select().from(providerWebhookInbox).where(eq(providerWebhookInbox.provider, 'fal')))[0]!;
    await assert.rejects(() => replayAdminProviderWebhook(commandDb, {...retryInput, expectedVersion: replayed.version, inboxId: foreignInbox.id, idempotencyKey: randomUUID()}), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
    const mismatchedInbox = (await tx.select().from(providerWebhookInbox).where(and(eq(providerWebhookInbox.provider, 'replicate'), eq(providerWebhookInbox.status, 'failed'))))[0]!;
    await assert.rejects(() => replayAdminProviderWebhook(commandDb, {...retryInput, expectedVersion: replayed.version, inboxId: mismatchedInbox.id, idempotencyKey: randomUUID()}), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
    // A separate operator retry still reuses the original provider-domain identity.
    await tx.update(providerWebhookInbox).set({status: 'received'}).where(eq(providerWebhookInbox.id, inboxId));
    await replayAdminProviderWebhook(commandDb, {...retryInput, expectedVersion: replayed.version, idempotencyKey: randomUUID()});
    assert.equal((await tx.select().from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, workspaceId))).length, ledgerBefore);
    assert.equal((await tx.select().from(submissionAttempts).where(eq(submissionAttempts.workspaceId, workspaceId))).length, attemptsBefore);
    assert.equal((await tx.select().from(generationQuarantine).where(eq(generationQuarantine.taskId, generation.taskId))).length, 1);
    const preserved = (await tx.select().from(generationTasks).where(eq(generationTasks.id, generation.taskId)))[0]!;
    assert.equal(preserved.status, 'failed');
    assert.equal(preserved.version, originalTaskVersion);
    assert.equal((await tx.select().from(creditReservations).where(eq(creditReservations.id, generation.reservationId)))[0]!.status, 'released');
    const {value: activeGeneration} = await createGenerationTask(commandDb, {actor, workspaceId, idempotencyKey: randomUUID(), quote: createServerQuote(DEFAULT_MODEL_ID, '2', {now}), input: {prompt: 'Resume only stored completion evidence'}, now});
    await tx.update(generationTasks).set({status: 'submitted', deadlineAt: new Date(now.getTime() + 600_000)}).where(eq(generationTasks.id, activeGeneration.taskId));
    const activeAttempt = randomUUID();
    const activeNonce = randomUUID();
    const completedInbox = randomUUID();
    const activeRequest = 'materialize-' + randomUUID();
    await tx.insert(submissionAttempts).values({id: activeAttempt, taskId: activeGeneration.taskId, workspaceId, attemptNo: 1, provider: 'replicate', clientReference: activeNonce, providerRequestId: activeRequest, state: 'submitted', startedAt: now, reconcileDeadline: now});
    await tx.insert(providerWebhookInbox).values({id: completedInbox, provider: 'replicate', externalEventId: randomUUID(), attemptNonce: activeNonce, providerRequestId: activeRequest, payloadHash: 'e'.repeat(64), payload: {status: 'completed', providerRequestId: activeRequest, attemptNonce: activeNonce}, status: 'received', receivedAt: now});
    const currentVersion = (await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0]!.version;
    const activeInput = {...retryInput, inboxId: completedInbox, expectedVersion: currentVersion, idempotencyKey: randomUUID()};
    await assert.rejects(() => replayAdminProviderWebhook(commandDb, activeInput), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    assert.equal((await tx.select().from(generationTasks).where(eq(generationTasks.id, activeGeneration.taskId)))[0]!.status, 'submitted');
    await tx.update(providerWebhookInbox).set({payload: {status: 'completed', providerRequestId: activeRequest, attemptNonce: activeNonce, authenticatedAt: now.toISOString()}}).where(eq(providerWebhookInbox.id, completedInbox));
    const activeLedgerBefore = (await tx.select().from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, workspaceId))).length;
    assert.equal((await replayAdminProviderWebhook(commandDb, activeInput)).status, 'processed');
    assert.equal((await tx.select().from(generationTasks).where(eq(generationTasks.id, activeGeneration.taskId)))[0]!.status, 'materializing');
    assert.equal((await tx.select().from(submissionAttempts).where(eq(submissionAttempts.id, activeAttempt)))[0]!.state, 'materializing');
    assert.equal((await tx.select().from(creditReservations).where(eq(creditReservations.id, activeGeneration.reservationId)))[0]!.status, 'active');
    assert.equal((await tx.select().from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, workspaceId))).length, activeLedgerBefore);
    const sharedGrantView = await readAdminRecovery(commandDb, {actor, workspaceId, purpose: 'Verify refund evidence belongs to the selected reservation', taskIds: [generation.taskId, activeGeneration.taskId]});
    assert.equal(sharedGrantView.tasks.find(task => task.taskId === generation.taskId)?.release?.entryType, 'refund');
    assert.equal(sharedGrantView.tasks.find(task => task.taskId === activeGeneration.taskId)?.reservation?.status, 'active');
    assert.equal(sharedGrantView.tasks.find(task => task.taskId === activeGeneration.taskId)?.release, null, 'A refund from another reservation sharing the grant must not appear as this active task refund.');
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log(JSON.stringify({status: 'PASS', database: 'PostgreSQL', crossProviderRequestCollision: true, wrongAttemptNonce: true, foreignTaskDenied: true, sweepReplay: true, staleVersionRejected: true, semanticConflictRejected: true, singleAuditAndOutbox: true, dueTaskSettledOnce: true, auditFailureRollsBackSettlement: true, boundedModelHealth: true, privateAssetFieldsRedacted: true, inboxAssetOutboxCorrelation: true, storedWebhookReplayPreservesOriginalKey: true, lateReplayPreservesTerminalCredits: true, webhookAuditFailureRollsBackProcessing: true, incompleteProofRejected: true, storedCompletionResumesMaterializationOnly: true, sharedGrantRefundIsolation: true, fixturesRolledBack: true}));
} finally {
  await database.pool.end();
}
