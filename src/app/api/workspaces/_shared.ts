import {eq} from 'drizzle-orm';
import {NextResponse} from 'next/server';

import {auth, getAuthDatabase} from '../../../lib/auth.ts';
import {DomainError} from '../../../db/contracts.ts';
import {userAccessControls} from '../../../db/schema/access.ts';
import {authUser} from '../../../db/schema/auth.ts';
import type {WorkspaceActor} from '../../../modules/workspaces/policy.ts';
import {getServerEnv} from '../../../config/env.ts';
import {commandKeyFromRequest, failure, hasTrustedMutationOrigin, parseJsonObject, success} from '../../../contracts/http.ts';

type SessionShape = Readonly<{
  user?: Readonly<{id?: unknown}>;
  session?: Readonly<{id?: unknown; userId?: unknown; createdAt?: unknown}>;
}>;

export async function currentWorkspaceActor(request: Request): Promise<WorkspaceActor | null> {
  const session = await auth.api.getSession({headers: request.headers}) as unknown as SessionShape | null;
  const userId = typeof session?.user?.id === 'string'
    ? session.user.id
    : typeof session?.session?.userId === 'string' ? session.session.userId : null;
  if (!userId) return null;
  const users = await getAuthDatabase().select({
    authDisabledAt: authUser.disabledAt,
    accessStatus: userAccessControls.status,
  }).from(authUser)
    .leftJoin(userAccessControls, eq(userAccessControls.userId, authUser.id))
    .where(eq(authUser.id, userId)).limit(1);
  if (!users[0] || users[0].authDisabledAt || users[0].accessStatus === 'disabled') return null;
  const authenticatedAt = session?.session?.createdAt;
  const sessionId = typeof session?.session?.id === 'string' ? session.session.id : undefined;
  // A session refresh updates updatedAt without checking credentials. Only
  // a newly authenticated session may satisfy the owner-transfer time bound.
  return {
    userId,
    sessionId,
    recentAuthenticationAt: authenticatedAt instanceof Date || typeof authenticatedAt === 'string' ? authenticatedAt : undefined,
  };
}

export function workspaceErrorResponse(error: unknown): NextResponse {
  return safeError(error);
}

/** Browser mutations must carry a trusted same-origin signal. */
export function assertSameOrigin(request: Request): void {
  if (!hasTrustedMutationOrigin(request, getServerEnv().appUrl)) throw new DomainError('FORBIDDEN', 'A same-origin or CSRF-protected request is required.');
}

export function safeSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(success(data), {status});
}

export function safeError(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : error.code === 'VALIDATION' ? 400 : 500;
    return NextResponse.json(failure(error.code, error.publicMessage), {status});
  }
  return NextResponse.json(failure('INTERNAL_ERROR', 'The request could not be completed.'), {status: 500});
}

export type ParsedJson = Readonly<{valid: true; body: Record<string, unknown>} | {valid: false}>;

export async function readJson(request: Request): Promise<ParsedJson> {
  try {
    const raw = await request.text();
    return {valid: true, body: parseJsonObject(raw)};
  } catch {
    return {valid: false};
  }
}

export function commandKey(request: Request, body: Record<string, unknown>): string {
  return commandKeyFromRequest(request, body);
}

export function workspaceIdFromParams(params: {workspaceId?: string}): string {
  const value = params.workspaceId?.trim();
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new DomainError('VALIDATION', 'workspaceId must be a UUID.');
  }
  return value;
}
