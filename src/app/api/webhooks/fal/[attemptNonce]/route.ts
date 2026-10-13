import {and, eq} from 'drizzle-orm';

import {getFalJwks} from '../../../../../adapters/providers/fal/jwks.ts';
import {verifyFalWebhook} from '../../../../../adapters/providers/fal/webhook.ts';
import {getProviderModel} from '../../../../../config/provider-models.ts';
import {getServerEnv} from '../../../../../config/env.ts';
import {DomainError} from '../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {generationTasks, submissionAttempts} from '../../../../../db/schema/generation.ts';
import {adoptVerifiedProviderRequest} from '../../../../../modules/generation/lifecycle.ts';
import {ingestProviderWebhook} from '../../../../../modules/generation/provider-webhooks.ts';
import {safeError, safeSuccess} from '../../../workspaces/_shared.ts';

export const runtime = 'nodejs';
type RouteContext = {params: Promise<{attemptNonce: string}>};

function requestIdFromBody(rawBody: Uint8Array): string {
  if (rawBody.byteLength === 0 || rawBody.byteLength > 1_000_000) throw new DomainError('VALIDATION', 'Webhook body is outside the bounded size.');
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(rawBody));
    const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const id = body.request_id ?? body.id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('invalid id');
    return id;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('VALIDATION', 'Provider request ID is invalid.');
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const {attemptNonce} = await context.params;
    if (!/^[A-Za-z0-9._~-]{1,200}$/.test(attemptNonce)) throw new DomainError('VALIDATION', 'attemptNonce is invalid.');
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const requestId = requestIdFromBody(rawBody);
    const db = getAuthDatabase();
    const row = (await db.select({attempt: submissionAttempts, task: generationTasks})
      .from(submissionAttempts)
      .innerJoin(generationTasks, and(eq(generationTasks.id, submissionAttempts.taskId), eq(generationTasks.workspaceId, submissionAttempts.workspaceId)))
      .where(and(eq(submissionAttempts.provider, 'fal'), eq(submissionAttempts.clientReference, attemptNonce)))
      .limit(1))[0];
    if (!row) throw new DomainError('CONFLICT', 'Provider request is not linked to the supplied attempt.');
    if (!row.attempt.providerRequestId && !getServerEnv().falWebhookAccountId) throw new DomainError('INFRASTRUCTURE', 'Unidentified Fal requests require a configured account binding.');
    const catalog = getProviderModel(row.task.modelKey);
    const env = getServerEnv();
    const jwks = env.falWebhookPublicKeyPem.trim() ? undefined : await getFalJwks();
    const verified = verifyFalWebhook(rawBody, request.headers, {provider: 'fal', modelKey: row.task.modelKey, requestId, catalog}, {
      publicKeyPem: env.falWebhookPublicKeyPem,
      jwks,
      jwksFetchedAt: jwks?.fetchedAt,
      expectedAccountId: env.falWebhookAccountId || undefined,
      expectedAttemptNonce: attemptNonce,
    });
    await adoptVerifiedProviderRequest(db, verified);
    const result = await ingestProviderWebhook(db, {provider: 'fal', rawBody, verified});
    return safeSuccess(result, result.duplicate ? 200 : 202);
  } catch (error) {
    return safeError(error);
  }
}
