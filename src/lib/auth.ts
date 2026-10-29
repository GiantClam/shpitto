import {APIError, betterAuth, type MiddlewareHandler} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {bearer} from 'better-auth/plugins/bearer';
import {twoFactor} from 'better-auth/plugins/two-factor';
import {createAuthMiddleware} from 'better-auth/api';
import {nextCookies} from 'better-auth/next-js';
import {eq} from 'drizzle-orm';

import type {MailAdapter} from '../adapters/contracts.ts';
import {createConfiguredMailAdapter} from '../adapters/mail/mailpit.ts';
import {getServerEnv} from '../config/env.ts';
import {createDatabase, type AppDatabase, type DatabaseHandle} from '../db/client.ts';
import {userAccessControls} from '../db/schema/access.ts';
import {authAccount, authSession, authTwoFactor, authUser, authVerification} from '../db/schema/auth.ts';
import {operatorStepUps} from '../db/schema/operator.ts';
import {DomainError} from '../db/contracts.ts';
import {recordTrustedSecondFactor, requireOperatorIdentity} from '../modules/operations/authorize.ts';
import {claimInitialOperatorOwner} from '../modules/operations/bootstrap.ts';
import {ensurePendingOnboarding} from '../modules/workspaces/onboard.ts';
import {readSecurityPolicy, readSecuritySettings} from '../modules/security/settings.ts';
import {verifyTurnstile} from '../modules/security/turnstile.ts';

export type AuthDatabase = Pick<DatabaseHandle, 'db'>;

function returnedAuthUserId(result: unknown): string | undefined {
  if (!result || result instanceof APIError || typeof result !== 'object') return undefined;
  const user = (result as Readonly<{user?: unknown}>).user;
  if (!user || typeof user !== 'object') return undefined;
  const userId = (user as Readonly<{id?: unknown}>).id;
  return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
}

function authSchema() {
  return {
    user: authUser,
    session: authSession,
    account: authAccount,
    verification: authVerification,
    twoFactor: authTwoFactor,
  } as const;
}

export function rejectDisabledEmailSignIn(database: AppDatabase): MiddlewareHandler {
  return async (input) => {
    const context = input as typeof input & Readonly<{path?: string; body?: unknown}>;
    if (!context.body || typeof context.body !== 'object') return;
    const security = await readSecurityPolicy(database);
    if (['/sign-up/email', '/sign-in/email', '/request-password-reset'].includes(context.path ?? '')) {
      const body = context.body as {turnstileToken?: unknown; email?: unknown};
      const action = context.path === '/sign-up/email' ? 'signup' : context.path === '/sign-in/email' ? 'login' : 'password-reset';
      if (security.turnstileEnabled) {
        if (!input.request) throw APIError.from('BAD_REQUEST', {code: 'TURNSTILE_REQUEST_INVALID', message: 'The authentication request is invalid.'});
        await verifyTurnstile(await readSecuritySettings(database), body.turnstileToken, new URL(getServerEnv().appUrl).hostname, action);
      }
      delete body.turnstileToken;
      if (context.path === '/sign-in/email' && security.emailVerificationEnabled && typeof body.email === 'string') {
        const verified = await database.select({emailVerified: authUser.emailVerified}).from(authUser).where(eq(authUser.email, body.email.trim().toLowerCase())).limit(1);
        if (verified[0] && !verified[0].emailVerified) throw APIError.from('FORBIDDEN', {code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before signing in.'});
      }
    }
    if (context.path !== '/sign-in/email') return;
    const email = (context.body as {email?: unknown}).email;
    if (typeof email !== 'string') return;
    const rows = await database.select({
      authDisabledAt: authUser.disabledAt,
      accessStatus: userAccessControls.status,
    }).from(authUser)
      .leftJoin(userAccessControls, eq(userAccessControls.userId, authUser.id))
      .where(eq(authUser.email, email.trim().toLowerCase())).limit(1);
    if (rows[0]?.authDisabledAt || rows[0]?.accessStatus === 'disabled') {
      throw APIError.from('FORBIDDEN', {code: 'ACCOUNT_DISABLED', message: 'This account is disabled.'});
    }
  };
}

export function createAuth(database: AppDatabase, options: Readonly<{mailAdapter?: MailAdapter}> = {}) {
  const env = getServerEnv();
  const mail = options.mailAdapter ?? createConfiguredMailAdapter(database);
  const sendAuthEmail = async (to: string, subject: string, body: string): Promise<void> => {
    const result = await mail.send({to, subject, body});
    if (!result.ok) throw APIError.from('SERVICE_UNAVAILABLE', {code: 'EMAIL_DELIVERY_UNAVAILABLE', message: 'Email delivery is temporarily unavailable. Please try again.'});
  };
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: authSchema(),
      transaction: true,
    }),
    secret: env.betterAuthSecret,
    baseURL: env.appUrl,
    trustedOrigins: [env.appUrl],
    hooks: {
      before: rejectDisabledEmailSignIn(database),
      after: createAuthMiddleware(async (context) => {
        if (context.path === '/sign-up/email') {
          const result = context.context.returned;
          if (!result || result instanceof APIError) return;
          const createdSession = context.context.newSession ?? context.context.session;
          const registeredUserId = returnedAuthUserId(result) ?? createdSession?.user.id;
          if (!registeredUserId) return;
          await claimInitialOperatorOwner(database, registeredUserId);
          if ((await readSecurityPolicy(database)).emailVerificationEnabled) {
            if (createdSession?.session?.id) await database.delete(authSession).where(eq(authSession.id, createdSession.session.id));
          }
          return;
        }
        if (context.path === '/sign-in/email') {
          const result = context.context.returned;
          if (!result || result instanceof APIError) return;
          const authenticatedUserId = returnedAuthUserId(result) ?? (context.context.newSession ?? context.context.session)?.user.id;
          if (authenticatedUserId) await claimInitialOperatorOwner(database, authenticatedUserId);
          return;
        }
        if (!['/two-factor/verify-totp', '/two-factor/verify-backup-code', '/two-factor/disable'].includes(context.path)) return;
        const result = context.context.returned;
        if (!result || result instanceof APIError || typeof result !== 'object') return;
        const current = context.context.newSession ?? context.context.session;
        if (!current?.session || !current.user) return;
        if (context.path === '/two-factor/disable') {
          await database.delete(operatorStepUps).where(eq(operatorStepUps.userId, current.user.id));
          return;
        }
        const actor = {userId: current.user.id, sessionId: current.session.id};
        try { await requireOperatorIdentity(database, actor, 'support'); } catch (error) {
          if (error instanceof DomainError && error.code === 'FORBIDDEN') return;
          throw error;
        }
        await recordTrustedSecondFactor(database, actor);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const now = new Date();
            await database.insert(userAccessControls).values({
              userId: user.id,
              status: 'active',
              disabledAt: null,
              reason: null,
              version: 1,
              createdAt: now,
              updatedAt: now,
            }).onConflictDoNothing();
            await ensurePendingOnboarding(database, user.id);
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({user, url}) => {
        try { await sendAuthEmail(user.email, 'Reset your Shpitto password', `Reset your password: ${url}\n\nIf you did not request this change, you can ignore this email.`); }
        catch { console.warn('Password reset email delivery failed.'); }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({user, url}) => {
        try { await sendAuthEmail(user.email, 'Verify your Shpitto email', `Verify your email address: ${url}\n\nIf you did not create this account, you can ignore this email.`); }
        catch { console.warn('Email verification delivery failed.'); }
      },
    },
    plugins: [bearer(), twoFactor({issuer: 'Shpitto'}), nextCookies()],
  });
}

let defaultDatabase: DatabaseHandle | undefined;
let defaultAuth: ReturnType<typeof createAuth> | undefined;

function getDefaultAuth() {
  if (!defaultAuth) {
    defaultDatabase = createDatabase();
    defaultAuth = createAuth(defaultDatabase.db);
  }
  return defaultAuth;
}

export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, property, receiver) {
    return Reflect.get(getDefaultAuth(), property, receiver);
  },
});

export function getAuthDatabase(): AppDatabase {
  if (!defaultDatabase) defaultDatabase = createDatabase();
  return defaultDatabase.db;
}

export async function closeAuthDatabase(): Promise<void> {
  if (defaultDatabase) {
    await defaultDatabase.pool.end();
    defaultDatabase = undefined;
    defaultAuth = undefined;
  }
}
