import {NextResponse} from 'next/server';

import {getProviderWorkerConfig, getRuntimeProfile} from '../../../../../config/env.ts';
import type {ServerQuote} from '../../../../../config/models.ts';
import {DomainError} from '../../../../../db/contracts.ts';
import {createGenerationTask, type ReadyInputSnapshot} from '../../../../../modules/generation/create.ts';
import {authorizeAsset} from '../../../../../modules/assets/authorize.ts';
import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {
  assertSameOrigin,
  commandKey,
  currentWorkspaceActor,
  readJson,
  safeError,
  safeSuccess,
  workspaceIdFromParams,
} from '../../_shared.ts';

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseQuote(value: unknown): ServerQuote {
  const quote = asObject(value, 'quote');
  for (const key of ['modelId', 'quantity', 'unitCost', 'totalCost', 'issuedAt', 'quoteHash']) {
    if (typeof quote[key] !== 'string' || quote[key].length === 0) {
      throw new DomainError('VALIDATION', `quote.${key} is required.`);
    }
  }
  if (typeof quote.catalogVersion !== 'number' || !Number.isInteger(quote.catalogVersion)) {
    throw new DomainError('VALIDATION', 'quote.catalogVersion must be an integer.');
  }
  return quote as unknown as ServerQuote;
}

function parseInput(value: unknown): ReadyInputSnapshot {
  const input = asObject(value, 'input');
  return input as unknown as ReadyInputSnapshot;
}

export async function POST(
  request: Request,
  context: {params: Promise<{workspaceId: string}>},
) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const workspaceId = workspaceIdFromParams(await context.params);
    const parsed = await readJson(request);
    if (!parsed.valid) throw new DomainError('VALIDATION', 'A valid JSON object is required.');
    const body = parsed.body;
    const mode = body.mode === undefined ? 'video' : body.mode;
    if (typeof mode !== 'string') throw new DomainError('VALIDATION', 'mode must be a string.');
    const result = await createGenerationTask(getAuthDatabase(), {
      actor,
      workspaceId,
      idempotencyKey: commandKey(request, body),
      quote: parseQuote(body.quote),
      input: parseInput(body.input),
      mode,
      profile: getRuntimeProfile(),
      acceptanceWorkspaceId: getRuntimeProfile() === 'acceptance' ? getProviderWorkerConfig().workspaceId ?? undefined : undefined,
      authorizeReadyInput: async (tx, currentActor, currentWorkspaceId, input) => {
        await authorizeAsset(tx, currentWorkspaceId, input.assetId!, currentActor);
      },
    });
    return safeSuccess(result, result.replayed ? 200 : 201);
  } catch (error) {
    return safeError(error);
  }
}
