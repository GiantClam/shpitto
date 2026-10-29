import {and, eq} from 'drizzle-orm';

import {verifyReplicateWebhook} from '../../../../../adapters/providers/replicate/webhook.ts';
import {getProviderModel} from '../../../../../config/provider-models.ts';
import {getRuntimeReplicateWebhookOptions} from '../../../../../adapters/providers/runtime.ts';
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
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(rawBody)); } catch { throw new DomainError('VALIDATION', 'Webhook body is invalid JSON.'); }
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (typeof body.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.id)) throw new DomainError('VALIDATION', 'Provider request ID is invalid.');
  return body.id;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const {attemptNonce} = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptNonce)) throw new DomainError('VALIDATION', 'attemptNonce is invalid.');
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const requestId = requestIdFromBody(rawBody);
    const db = getAuthDatabase();
    const row = (await db.select({attempt: submissionAttempts, task: generationTasks})
      .from(submissionAttempts)
      .innerJoin(generationTasks, and(eq(generationTasks.id, submissionAttempts.taskId), eq(generationTasks.workspaceId, submissionAttempts.workspaceId)))
      .where(and(eq(submissionAttempts.provider, 'replicate'), eq(submissionAttempts.clientReference, attemptNonce)))
      .limit(1))[0];
    if (!row) throw new DomainError('CONFLICT', 'Provider request is not linked to the supplied attempt.');
    const catalog = getProviderModel(row.task.modelKey);
    const options = await getRuntimeReplicateWebhookOptions(row.attempt.clientReference);
    // A known request must match storage. Only missing-ID recovery starts from the signed body ID.
    const verified = verifyReplicateWebhook(rawBody, request.headers, {provider: 'replicate', modelKey: row.task.modelKey, requestId: row.attempt.providerRequestId ?? requestId, catalog}, options);
    await adoptVerifiedProviderRequest(db, verified);
    const result = await ingestProviderWebhook(db, {provider: 'replicate', rawBody, verified});
    return safeSuccess(result, result.duplicate ? 200 : 202);
  } catch (error) {
    return safeError(error);
  }
}
