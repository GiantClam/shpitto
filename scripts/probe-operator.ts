import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {operatorRoles, operatorStepUps, OPERATOR_STEP_UP_TTL_MS} from '../src/db/schema/operator.ts';
import {creditAccounts, workspaces} from '../src/db/schema/workspace.ts';
import {DomainError} from '../src/db/contracts.ts';
import {
  authorizeOperatorCommand,
  recordTrustedSecondFactor,
  requireCurrentOperator,
} from '../src/modules/operations/authorize.ts';
import {createTeamWorkspace} from '../src/modules/workspaces/commands.ts';

const suffix = randomUUID();
const users = {
  owner: `operator-probe-owner-${suffix}`,
  operator: `operator-probe-user-${suffix}`,
};
const sessions = {
  owner: `operator-probe-owner-session-${suffix}`,
  operator: `operator-probe-session-${suffix}`,
  other: `operator-probe-other-session-${suffix}`,
  expired: `operator-probe-expired-session-${suffix}`,
};

async function migrateDatabase(): Promise<void> {
  const client = createMigrationClient();
  await client.connect();
  try {
    await migrate(drizzle(client), {migrationsFolder: 'src/db/migrations'});
  } finally {
    await client.end();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function forbidden(result: PromiseSettledResult<unknown>): boolean {
  return result.status === 'rejected' && result.reason instanceof DomainError && result.reason.code === 'FORBIDDEN';
}

async function run(): Promise<void> {
  await migrateDatabase();
  const database = createDatabase({max: 8});
  let workspaceId = '';
  try {
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000);
    await database.db.insert(authUser).values([
      {id: users.owner, name: 'Operator probe owner', email: `${users.owner}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: users.operator, name: 'Operator probe user', email: `${users.operator}@example.test`, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(authSession).values([
      {id: sessions.owner, userId: users.owner, token: `${sessions.owner}-token`, expiresAt: expiry, createdAt: now, updatedAt: now},
      {id: sessions.operator, userId: users.operator, token: `${sessions.operator}-token`, expiresAt: expiry, createdAt: now, updatedAt: now},
      {id: sessions.other, userId: users.operator, token: `${sessions.other}-token`, expiresAt: expiry, createdAt: now, updatedAt: now},
      {id: sessions.expired, userId: users.operator, token: `${sessions.expired}-token`, expiresAt: new Date(now.getTime() - 1), createdAt: now, updatedAt: now},
    ]);
    workspaceId = (await createTeamWorkspace(database.db, {userId: users.owner}, 'Operator probe')).workspaceId;

    const ownerActor = {userId: users.owner, sessionId: sessions.owner};
    const ownerDenied = await Promise.allSettled([requireCurrentOperator(database.db, ownerActor)]);
    assert(forbidden(ownerDenied[0]!), 'Workspace owner escalated to operator without a global role.');

    await database.db.insert(operatorRoles).values({userId: users.operator, role: 'operator', grantedAt: now, updatedAt: now});
    const missingStepUp = await Promise.allSettled([
      authorizeOperatorCommand(database.db, {userId: users.operator, sessionId: sessions.operator}),
    ]);
    assert(forbidden(missingStepUp[0]!), 'Operator command succeeded without step-up.');

    await recordTrustedSecondFactor(database.db, {userId: users.operator, sessionId: sessions.operator}, now);
    const authorized = await authorizeOperatorCommand(database.db, {userId: users.operator, sessionId: sessions.operator}, 'operator', now);
    assert(authorized.role === 'operator', 'Operator role was not returned after valid step-up.');

    const wrongSession = await Promise.allSettled([
      authorizeOperatorCommand(database.db, {userId: users.operator, sessionId: sessions.other}, 'operator', now),
    ]);
    assert(forbidden(wrongSession[0]!), 'Step-up was accepted from a different live session.');

    const expiredSession = await Promise.allSettled([
      requireCurrentOperator(database.db, {userId: users.operator, sessionId: sessions.expired}),
    ]);
    assert(forbidden(expiredSession[0]!), 'An expired live session retained operator access.');

    const expired = await Promise.allSettled([
      authorizeOperatorCommand(database.db, {userId: users.operator, sessionId: sessions.operator}, 'operator', new Date(now.getTime() + OPERATOR_STEP_UP_TTL_MS)),
    ]);
    assert(forbidden(expired[0]!), 'Expired step-up remained valid.');

    await database.db.update(operatorRoles).set({revokedAt: new Date(now.getTime() + 1)}).where(eq(operatorRoles.userId, users.operator));
    const revoked = await Promise.allSettled([
      authorizeOperatorCommand(database.db, {userId: users.operator, sessionId: sessions.operator}, 'operator', now),
    ]);
    assert(forbidden(revoked[0]!), 'Revoked operator role remained valid in the same session.');

    const stepUps = await database.db.select().from(operatorStepUps).where(and(
      eq(operatorStepUps.userId, users.operator),
      eq(operatorStepUps.sessionId, sessions.operator),
    ));
    assert(stepUps.length === 1, 'Trusted step-up stamp was not persisted exactly once.');
    console.log(JSON.stringify({
      status: 'PASS',
      ownerEscalationRejected: true,
      missingStepUpRejected: true,
      sameSessionAccepted: true,
      differentSessionRejected: true,
      expiredSessionRejected: true,
      expiredRejected: true,
      revocationImmediate: true,
    }));
  } finally {
    if (workspaceId) await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceId));
    if (workspaceId) await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId));
    if (workspaceId) await database.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await database.db.delete(authUser).where(eq(authUser.id, users.owner));
    await database.db.delete(authUser).where(eq(authUser.id, users.operator));
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
