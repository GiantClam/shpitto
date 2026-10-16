import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {open, readFile, rename, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJson} from '../src/contracts/http.ts';
import {assertPrivateRailwayWorkerDatabase} from '../src/config/provider-worker.ts';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const WORKER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MODEL = 'replicate-wan22-t2v';
const PHASES = ['prepare', 'seed-overdue', 'inspect', 'verify'] as const;
const STAGES = ['preparing', 'prepared', 'seeding', 'seeded', 'verified'];
type Phase = typeof PHASES[number];
type Args = Readonly<{runId: string; phase: Phase}>;
type Binding = Readonly<{projectId: string; workerKey: string; workspaceId?: string}>;
export type RecoveryProbeScope = Readonly<{
  profile: string; nodeEnv: string; generationDriver: string; storageDriver: string; taskRuntime: string; databaseUrl: string;
  projectId: string; expectedProjectId: string; workerKey: string; workerState: string; workerWorkspaceId: string | null;
  allowCreate: boolean; modelKeys: readonly string[]; monitorWorkspaceId: string;
}>;
type TaskEvidence = Readonly<{taskId: string; reservationId: string; taskHash: string; reservationHash: string; allocationsHash: string}>;
type State = Binding & Readonly<{
  runId: string; ownerId: string; stage: string; preparedAt: string; databaseHash: string; tasks: readonly TaskEvidence[];
  fixtureBaseAt?: string; seededAt?: string; grantId?: string; unknownAttemptId?: string; unknownAttemptHash?: string;
}>;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) => sha(canonicalJson(value));

export function parseRecoveryProbeArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i], value = argv[++i];
    assert.ok(['--run-id', '--phase'].includes(key) && !values.has(key) && value && !value.startsWith('--'), 'Invalid/repeated probe argument.');
    values.set(key, value);
  }
  const runId = (values.get('--run-id') ?? '').toLowerCase(), phase = values.get('--phase') as Phase;
  assert.match(runId, UUID); assert.ok(PHASES.includes(phase), 'An explicit recovery phase is required.');
  return {runId, phase};
}

export function assertRecoveryProbeStage(phase: Phase, stage: string | undefined): void {
  if (phase === 'prepare') assert.equal(stage, undefined, 'Never repeat prepare, including partial preparation.');
  else if (phase === 'seed-overdue') assert.equal(stage, 'prepared', 'Never repeat seed after its irreversible fence.');
  else if (phase === 'verify') assert.ok(stage === 'seeded' || stage === 'verified', 'Seeding must have completed.');
  else assert.ok(stage !== undefined && STAGES.includes(stage), 'Unknown local stage.');
}

export function assertRecoveryProbeScope(input: RecoveryProbeScope, phase: Phase, own?: Binding): void {
  assertPrivateRailwayWorkerDatabase(input.databaseUrl);
  assert.equal(input.profile, 'acceptance'); assert.equal(input.nodeEnv, 'production');
  assert.equal(input.generationDriver, 'provider'); assert.equal(input.storageDriver, 's3'); assert.equal(input.taskRuntime, 'self_hosted');
  assert.ok(input.projectId && input.projectId === input.expectedProjectId, 'Exact isolated Railway project binding required.');
  assert.match(input.workerKey, WORKER); assert.equal(input.allowCreate, false, 'Worker creates must stay disabled.');
  assert.ok(input.modelKeys.includes(MODEL)); assert.ok(['paused', 'active'].includes(input.workerState));
  if (phase === 'prepare' || phase === 'seed-overdue') assert.equal(input.workerState, 'paused', 'Mutation phases require a paused worker.');
  if (own) {
    assert.equal(input.projectId, own.projectId); assert.equal(input.workerKey, own.workerKey);
    if (own.workspaceId) { assert.match(own.workspaceId, UUID); assert.equal(input.monitorWorkspaceId, own.workspaceId); }
  }
  if (input.workerState === 'active') {
    assert.ok(own?.workspaceId, 'Active inspection requires run-owned workspace.');
    assert.equal(input.workerWorkspaceId, own.workspaceId);
  }
}

export function recoveryFixtureTimes(base: Date) {
  assert.ok(Number.isFinite(base.getTime()));
  return {queued: new Date(base.getTime() - 20 * 60_000), unknown: new Date(base.getTime() - 95 * 60_000)};
}

function selectedHash(row: Record<string, unknown>, keys: readonly string[]) {
  return hash(Object.fromEntries(keys.filter(key => key in row).map(key => [key, row[key]])));
}
export function recoveryTaskHash(row: Record<string, unknown>): string {
  return selectedHash(row, ['id', 'workspaceId', 'requestedBy', 'mode', 'modelKey', 'catalogVersion', 'catalogSnapshot', 'inputSnapshot',
    'policySnapshot', 'quotedCredits', 'createdAt', 'queueDeadlineAt', 'deadlineAt', 'stageDeadlineAt', 'overallDeadlineAt',
    'dispatchStartedAt', 'submissionStartedAt', 'dispatchIdentity']);
}
const reservationHash = (row: Record<string, unknown>) => hash(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'status')));
const attemptHash = (row: Record<string, unknown>) => selectedHash(row, ['id', 'taskId', 'workspaceId', 'attemptNo', 'provider', 'clientReference', 'startedAt', 'reconcileDeadline']);

/** Closed projection: never print state, command keys, nonce, credentials or raw alert evidence. */
export function recoveryProbeReport(value: Record<string, unknown>) {
  const id = (v: unknown) => typeof v === 'string' && UUID.test(v) ? v : null;
  const count = (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 103 ? Number(v) : null;
  return {runId: id(value.runId), workspaceId: id(value.workspaceId), incidentId: id(value.incidentId),
    phase: PHASES.includes(value.phase as Phase) ? value.phase : null, stage: STAGES.includes(String(value.stage)) ? value.stage : null,
    taskIds: Array.isArray(value.taskIds) ? value.taskIds.slice(0, 102).filter(v => id(v) !== null) : [],
    taskCount: count(value.taskCount), failedCount: count(value.failedCount), releasedCount: count(value.releasedCount),
    verified: value.verified === true, fixtureClockOffsetsMinutes: {queued: -20, unknown: -95},
    proof: 'fake-clock/domain-fault fixture; no upstream outcome proof'};
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseRecoveryProbeArgs(argv);
  const [{and, asc, eq, sql}, configApi, {createDatabase}, {authUser}, ws, gen, {operatorRecoveryNotes}, hb,
    {createServerQuote}, {completePersonalWorkspaceOnboarding}, {issueGrant}, {createGenerationTask}, lifecycle, outbox, alerts] = await Promise.all([
    import('drizzle-orm'), import('../src/config/env.ts'), import('../src/db/client.ts'), import('../src/db/schema/auth.ts'),
    import('../src/db/schema/workspace.ts'), import('../src/db/schema/generation.ts'), import('../src/db/schema/operations.ts'),
    import('../src/db/schema/recovery-heartbeat.ts'), import('../src/config/models.ts'), import('../src/modules/workspaces/onboard.ts'),
    import('../src/modules/credits/ledger.ts'), import('../src/modules/generation/create.ts'), import('../src/modules/generation/lifecycle.ts'),
    import('../src/modules/generation/outbox.ts'), import('../src/modules/operations/recovery-alert-delivery.ts'),
  ]);
  const env = configApi.getServerEnv(), worker = configApi.getProviderWorkerConfig(), monitor = configApi.getRecoveryMonitorEnvironment();
  const scope: RecoveryProbeScope = {profile: env.runtimeProfile, nodeEnv: env.nodeEnv, generationDriver: env.generationDriver,
    storageDriver: env.storageDriver, taskRuntime: env.taskRuntime, databaseUrl: env.databaseUrl, projectId: monitor.projectId,
    expectedProjectId: monitor.expectedProjectId, workerKey: monitor.workerKey, workerState: worker.state,
    workerWorkspaceId: worker.workspaceId, allowCreate: worker.allowCreate, modelKeys: worker.modelKeys, monitorWorkspaceId: monitor.workspaceId};
  // Full scope validation precedes DB access/mutation; active reads need the local run binding first.
  if (args.phase === 'prepare') assertRecoveryProbeScope(scope, args.phase);
  const url = new URL(env.databaseUrl), databaseHash = hash({host: url.hostname, port: url.port, database: url.pathname});
  const statePath = resolve(`/tmp/shpitto-worker-recovery-${args.runId}.json`);
  let state: State;
  const save = async () => {
    const temporary = `${statePath}.${randomUUID()}`, file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, statePath);
  };
  if (args.phase === 'prepare') {
    state = {runId: args.runId, ownerId: `recovery-owner-${args.runId}`, projectId: scope.projectId, workerKey: scope.workerKey,
      stage: 'preparing', preparedAt: new Date().toISOString(), databaseHash, tasks: []};
    const fresh = await open(statePath, 'wx', 0o600);
    try { await fresh.writeFile(JSON.stringify(state)); await fresh.sync(); } finally { await fresh.close(); }
  } else {
    assert.ok((await stat(statePath)).size <= 262_144, 'Local state exceeds its bounded size.');
    state = JSON.parse(await readFile(statePath, 'utf8')) as State;
    assert.equal(state.runId, args.runId); assert.equal(state.ownerId, `recovery-owner-${args.runId}`); assert.equal(state.databaseHash, databaseHash);
    assert.ok(Array.isArray(state.tasks) && state.tasks.length <= 102); assertRecoveryProbeStage(args.phase, state.stage);
    assertRecoveryProbeScope(scope, args.phase, state);
  }
  const database = createDatabase({max: 2, connectionTimeoutMillis: 5_000}), db = database.db;
  const serverNow = async () => new Date((await db.execute<{now: Date | string}>(sql`select date_trunc('milliseconds', clock_timestamp()) as now`)).rows[0]!.now);
  const report = (data: Record<string, unknown> = {}) => console.log(JSON.stringify(recoveryProbeReport({...state, phase: args.phase, ...data})));
  try {
    if (args.phase === 'prepare') {
      const now = await serverNow();
      await db.insert(authUser).values({id: state.ownerId, name: 'Seeded recovery drill identity', email: `${state.ownerId}@example.test`, emailVerified: true, createdAt: now, updatedAt: now});
      const workspace = await completePersonalWorkspaceOnboarding(db, state.ownerId, `Recovery drill ${args.runId}`, {fundDemoCredits: false, idempotencyKey: `recovery.prepare.${args.runId}`});
      assert.equal(workspace.created, true, 'Only a freshly onboarded workspace is permitted.');
      state = {...state, workspaceId: workspace.workspaceId, stage: 'prepared', preparedAt: now.toISOString()}; await save(); report(); return;
    }
    if (!state.workspaceId && args.phase === 'inspect') { report(); return; }
    assert.ok(state.workspaceId && UUID.test(state.workspaceId));
    const workspaceId = state.workspaceId, actor = {userId: state.ownerId};
    const owned = await db.select().from(ws.workspaces).where(and(eq(ws.workspaces.id, workspaceId), eq(ws.workspaces.createdBy, state.ownerId), eq(ws.workspaces.name, `Recovery drill ${args.runId}`))).limit(1);
    assert.equal(owned.length, 1, 'Run-owned onboarding workspace required.');
    const readTask = async (taskId: string) => {
      const [row] = await db.select().from(gen.generationTasks).where(and(eq(gen.generationTasks.workspaceId, workspaceId), eq(gen.generationTasks.id, taskId)));
      assert.ok(row && row.requestedBy === state.ownerId && row.modelKey === MODEL); return row;
    };
    const taskEvidence = async (taskId: string, reservationId: string): Promise<TaskEvidence> => {
      const [reservation] = await db.select().from(ws.creditReservations).where(and(eq(ws.creditReservations.workspaceId, workspaceId), eq(ws.creditReservations.id, reservationId)));
      assert.ok(reservation && reservation.taskId === taskId);
      const allocations = await db.select().from(ws.creditAllocations).where(and(eq(ws.creditAllocations.workspaceId, workspaceId), eq(ws.creditAllocations.reservationId, reservationId))).orderBy(asc(ws.creditAllocations.id));
      return {taskId, reservationId, taskHash: recoveryTaskHash(await readTask(taskId)), reservationHash: reservationHash(reservation), allocationsHash: hash(allocations)};
    };
    if (args.phase === 'seed-overdue') {
      assert.equal(state.tasks.length, 0);
      for (const table of [gen.generationTasks, ws.creditGrants, ws.creditReservations]) {
        assert.equal((await db.select({id: table.id}).from(table).where(eq(table.workspaceId, workspaceId)).limit(1)).length, 0, 'Seed requires an empty fresh workspace.');
      }
      // Consumed BEFORE funding/task mutations, including a crash between marker and state replacement.
      const fence = await open(`${statePath}.seed`, 'wx', 0o600); await fence.sync(); await fence.close();
      const base = await serverNow(), times = recoveryFixtureTimes(base);
      state = {...state, stage: 'seeding', fixtureBaseAt: base.toISOString()}; await save();
      const grant = await issueGrant(db, {actorUserId: state.ownerId, workspaceId, source: 'demo', amount: 2000n,
        commandName: 'credits.recovery-fixture', commandKey: `recovery.grant.${args.runId}`, businessKey: `recovery.grant.${args.runId}`, payload: {fixture: 'fake-clock/domain-fault'}});
      state = {...state, grantId: grant.grantId}; await save();
      for (let index = 0; index < 102; index++) {
        const now = index === 0 ? times.unknown : times.queued;
        const created = (await createGenerationTask(db, {actor, workspaceId, acceptanceWorkspaceId: workspaceId, profile: 'acceptance', mode: 't2v',
          input: {prompt: 'Recovery fault fixture. No provider request is authorized.', options: {aspectRatio: '16:9'}},
          quote: createServerQuote(MODEL, '1', {profile: 'acceptance', now}), idempotencyKey: `recovery.task.${args.runId}.${index}`, now})).value;
        state = {...state, tasks: [...state.tasks, await taskEvidence(created.taskId, created.reservationId)]}; await save();
        if (index === 0) {
          const lease = await outbox.claimOutbox(db, `recovery-fixture-${args.runId}`, now, {workspaceId, eventType: 'generation.dispatch'});
          assert.ok(lease && (lease.payload as {reservationId?: string}).reservationId === created.reservationId);
          const common = {actor, workspaceId, taskId: created.taskId, now, outboxLease: lease};
          const claimed = (await lifecycle.claimDispatch(db, {...common, provider: 'replicate', idempotencyKey: `recovery.claim.${args.runId}`})).value;
          assert.equal(await lifecycle.beginProviderSubmission(db, {...common, attemptId: claimed.attemptId}), true);
          await lifecycle.markSubmissionUnknown(db, {...common, attemptId: claimed.attemptId, idempotencyKey: `recovery.unknown.${args.runId}`});
          assert.equal(await outbox.releaseOutbox(db, lease, now, now), true);
          const [attempt] = await db.select().from(gen.submissionAttempts).where(and(eq(gen.submissionAttempts.workspaceId, workspaceId), eq(gen.submissionAttempts.id, claimed.attemptId)));
          assert.ok(attempt);
          state = {...state, unknownAttemptId: claimed.attemptId, unknownAttemptHash: attemptHash(attempt), tasks: [await taskEvidence(created.taskId, created.reservationId)]}; await save();
        }
      }
      state = {...state, stage: 'seeded', seededAt: (await serverNow()).toISOString()}; await save();
      report({taskCount: 102, taskIds: state.tasks.map(t => t.taskId)}); return;
    }
    const evidence = await db.transaction(async tx => {
      await tx.execute(sql`set transaction isolation level repeatable read, read only`);
      const tasks = await tx.select().from(gen.generationTasks).where(eq(gen.generationTasks.workspaceId, workspaceId)).limit(103);
      const reservations = await tx.select().from(ws.creditReservations).where(eq(ws.creditReservations.workspaceId, workspaceId)).limit(103);
      const grants = await tx.select().from(ws.creditGrants).where(eq(ws.creditGrants.workspaceId, workspaceId)).limit(103);
      const allocations = await tx.select().from(ws.creditAllocations).where(eq(ws.creditAllocations.workspaceId, workspaceId)).orderBy(asc(ws.creditAllocations.id)).limit(103);
      const attempts = await tx.select().from(gen.submissionAttempts).where(eq(gen.submissionAttempts.workspaceId, workspaceId)).limit(103);
      const [heartbeat] = await tx.select().from(hb.recoveryHeartbeats).where(and(eq(hb.recoveryHeartbeats.workspaceId, workspaceId), eq(hb.recoveryHeartbeats.workerKey, state.workerKey)));
      const incidents = await tx.select().from(hb.recoveryHeartbeatIncidents).where(and(eq(hb.recoveryHeartbeatIncidents.workspaceId, workspaceId), eq(hb.recoveryHeartbeatIncidents.workerKey, state.workerKey))).orderBy(asc(hb.recoveryHeartbeatIncidents.openedAt)).limit(103);
      const notes = await tx.select().from(operatorRecoveryNotes).where(and(eq(operatorRecoveryNotes.workspaceId, workspaceId), eq(operatorRecoveryNotes.subjectType, 'sweep_heartbeat'), eq(operatorRecoveryNotes.subjectId, state.workerKey))).limit(103);
      const now = new Date((await tx.execute<{now: Date | string}>(sql`select clock_timestamp() as now`)).rows[0]!.now);
      return {tasks, reservations, grants, allocations, attempts, heartbeat, incidents, notes, now};
    });
    const {tasks, reservations, grants, allocations, attempts, heartbeat, incidents, notes, now} = evidence;
    const counts = {taskCount: tasks.length, failedCount: tasks.filter(t => t.status === 'failed' && t.failureCode === 'generation.deadline_exceeded').length,
      releasedCount: reservations.filter(r => r.status === 'released').length, taskIds: tasks.map(t => t.id)};
    if (args.phase === 'inspect') { report(counts); return; }
    assert.deepEqual([counts.taskCount, counts.failedCount, counts.releasedCount, state.tasks.length], [102, 102, 102, 102]);
    assert.equal(new Set(state.tasks.map(t => t.taskId)).size, 102); assert.equal(new Set(state.tasks.map(t => t.reservationId)).size, 102);
    assert.equal(reservations.length, 102); assert.equal(allocations.length, 102);
    for (const expected of state.tasks) {
      const task = tasks.find(t => t.id === expected.taskId), reservation = reservations.find(r => r.id === expected.reservationId);
      assert.ok(task && task.requestedBy === state.ownerId && task.modelKey === MODEL && reservation && reservation.taskId === task.id);
      assert.equal(recoveryTaskHash(task), expected.taskHash); assert.equal(reservationHash(reservation), expected.reservationHash);
      const assigned = allocations.filter(a => a.reservationId === reservation.id);
      assert.equal(hash(assigned), expected.allocationsHash); assert.equal(assigned.length, 1);
      assert.ok(assigned[0].grantId === state.grantId && assigned[0].sourceExpiry === null && assigned[0].amount === task.quotedCredits);
    }
    assert.equal(grants.length, 1); const grant = grants[0];
    assert.ok(grant.id === state.grantId && grant.source === 'demo' && grant.expiresAt === null);
    assert.deepEqual([grant.issued, grant.available, grant.reserved, grant.consumed, grant.expired, grant.voided], [2000n, 2000n, 0n, 0n, 0n, 0n]);
    assert.equal(attempts.length, 1); const attempt = attempts[0];
    assert.ok(attempt.id === state.unknownAttemptId && attempt.taskId === state.tasks[0].taskId && attempt.attemptNo === 1 && attempt.state === 'failed');
    assert.equal(attemptHash(attempt), state.unknownAttemptHash);
    assert.equal(attempt.providerRequestId, null); assert.equal(attempt.providerStatusUrl, null); assert.equal(attempt.providerResultUrl, null);
    assert.ok(tasks.filter(t => t.submissionStartedAt !== null).length === 1, 'Never reset or repeat the submission fence.');
    assert.ok(heartbeat?.lastSuccessAt && heartbeat.lastSuccessAt >= new Date(state.seededAt!) && heartbeat.lastSuccessAt <= now && now.getTime() - heartbeat.lastSuccessAt.getTime() <= 180_000, 'Fresh durable successful sweep after restore required.');
    assert.ok(incidents.length > 0 && incidents.length < 103 && incidents.every(i => i.recoveredAt && i.deliveredAt), 'Every observed outage must be recovered AND externally delivered.');
    let incidentId: string | undefined;
    for (const incident of incidents) {
      if (incident.openedAt < new Date(state.preparedAt) || incident.recoveredAt! < new Date(state.seededAt!)) continue;
      const payload = alerts.validateRecoveryAlert({incidentId: incident.id, workspaceId, workerKey: state.workerKey, expectedAt: incident.expectedAt.toISOString(),
        observedAt: incident.openedAt.toISOString(), lastSweepAt: incident.lastSweepAt?.toISOString() ?? null, ageSeconds: incident.ageSeconds, code: 'sweep_heartbeat_missing', action: alerts.RECOVERY_ACTION});
      const reason = `${payload.code}; age=${payload.ageSeconds}s; observed=${payload.observedAt}; last=${payload.lastSweepAt ?? 'never'}; sha256=${sha(JSON.stringify(payload))}. ${payload.action}`;
      const note = notes.find(n => n.id === incident.id);
      assert.ok(note && note.reason === reason && note.createdAt >= incident.openedAt && note.createdAt <= incident.deliveredAt!, 'Exact external operator receipt required.');
      assert.ok(heartbeat.lastSuccessAt! > incident.openedAt && incident.recoveredAt! > incident.openedAt); incidentId = incident.id;
    }
    assert.ok(incidentId, 'A real monitor outage/receipt/recovery within this run is required.');
    state = {...state, stage: 'verified'}; await save(); report({...counts, incidentId, verified: true});
  } finally { await database.pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {console.error('Recovery fixture probe failed. Inspect this run; never retry partial prepare/seed. No secrets are printed.'); process.exitCode = 1;});
}
