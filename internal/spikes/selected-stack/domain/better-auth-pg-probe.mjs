import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { authSchema, userTable, sessionTable } from './better-auth-schema.mjs';

const databaseUrl = process.env.M0_DATABASE_URL;
if (!databaseUrl) throw new Error('M0_DATABASE_URL is required');

const migrationPaths = [
  resolve(import.meta.dirname, 'migrations/0000_m0_foundation.sql'),
  resolve(import.meta.dirname, 'migrations/0001_better_auth.sql'),
];
const migrationText = migrationPaths.map((path) => readFileSync(path, 'utf8')).join('\n');
const migrationSha256 = createHash('sha256').update(migrationText).digest('hex');

function createAuth(db) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema, transaction: true }),
    secret: 'm0-disposable-secret-that-is-long-enough',
    baseURL: 'http://localhost:3000',
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
  });
}

const firstPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const firstDb = drizzle(firstPool, { schema: authSchema });
await firstDb.execute(sql.raw(migrationText));
await firstDb.delete(sessionTable);
await firstDb.delete(userTable);

const auth = createAuth(firstDb);
const email = `m0-pg-${Date.now()}@example.test`;
const signUp = await auth.api.signUpEmail({
  body: { email, password: 'M0-password-123!', name: 'M0 PostgreSQL User' },
});
if (!signUp?.user?.email) throw new Error(`Better Auth PostgreSQL signup failed: ${JSON.stringify(signUp)}`);

const signIn = await auth.api.signInEmail({ body: { email, password: 'M0-password-123!' } });
const token = signIn?.token ?? signIn?.session?.token ?? signIn?.data?.session?.token;
if (!token) throw new Error(`Better Auth PostgreSQL sign-in failed: ${JSON.stringify(signIn)}`);
const firstSession = await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) });
if (!firstSession?.session?.userId) throw new Error(`Initial PostgreSQL session lookup failed: ${JSON.stringify(firstSession)}`);

await firstPool.end();
const secondPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const secondDb = drizzle(secondPool, { schema: authSchema });
const reloadedAuth = createAuth(secondDb);
const reloadedSession = await reloadedAuth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) });
const persistedUsers = await secondDb.select({ id: userTable.id }).from(userTable);
const persistedSessions = await secondDb.select({ token: sessionTable.token }).from(sessionTable);
await secondDb.delete(sessionTable);
await secondDb.delete(userTable);
await secondPool.end();

const result = {
  migrationSha256,
  adapter: 'Better Auth Drizzle adapter over node-postgres',
  authenticated: true,
  sessionReloadedAfterPoolRestart: Boolean(reloadedSession?.session?.userId === firstSession.session.userId),
  persistedUserRows: persistedUsers.length,
  persistedSessionRows: persistedSessions.length,
  operatorRoleGrantedByAuth: false,
  externalCalls: 0,
};
if (!result.sessionReloadedAfterPoolRestart || result.persistedUserRows !== 1 || result.persistedSessionRows < 1) {
  throw new Error(`Better Auth PostgreSQL probe failed: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify(result));
