import {NextResponse} from 'next/server';

import {getServerEnv} from '../../../../../config/env.ts';
import {getPrivateObjectStore} from '../../../../../adapters/storage/runtime.ts';
import {parseJsonObject} from '../../../../../contracts/http.ts';
import {DomainError} from '../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {uploadInputAsset} from '../../../../../modules/assets/upload.ts';
import {assertSameOrigin, currentWorkspaceActor, safeError, safeSuccess, workspaceIdFromParams} from '../../_shared.ts';

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_ENCODED_LENGTH = 4 * Math.ceil(MAX_INPUT_BYTES / 3);
const MAX_UPLOAD_BODY_BYTES = MAX_ENCODED_LENGTH + 1024;

class UploadTooLarge extends Error {}

async function readUploadJson(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > MAX_UPLOAD_BODY_BYTES) {
    await request.body?.cancel().catch(() => undefined);
    throw new UploadTooLarge();
  }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const parts: string[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_UPLOAD_BODY_BYTES) throw new UploadTooLarge();
      parts.push(decoder.decode(chunk.value, {stream: true}));
    }
    parts.push(decoder.decode());
    return parseJsonObject(parts.join(''));
  } catch (error) {
    if (error instanceof UploadTooLarge) throw error;
    throw new DomainError('VALIDATION', 'A valid UTF-8 JSON object is required.');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function POST(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const body = await readUploadJson(request);
    const mime = body.mime;
    const contentBase64 = body.contentBase64;
    if (typeof contentBase64 === 'string' && contentBase64.length > MAX_ENCODED_LENGTH) throw new UploadTooLarge();
    if (typeof mime !== 'string' || typeof contentBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) throw new DomainError('VALIDATION', 'mime and contentBase64 are required.');
    const padding = contentBase64.endsWith('==') ? 2 : contentBase64.endsWith('=') ? 1 : 0;
    if (Math.floor(contentBase64.length * 3 / 4) - padding > MAX_INPUT_BYTES) throw new UploadTooLarge();
    const bytes = Buffer.from(contentBase64, 'base64');
    const {workspaceId} = await context.params;
    const result = await uploadInputAsset(getAuthDatabase(), {actor, workspaceId: workspaceIdFromParams({workspaceId}), store: getPrivateObjectStore(), bytes, mime});
    return safeSuccess(result, 201);
  } catch (error) {
    if (error instanceof UploadTooLarge) return NextResponse.json({ok: false, error: {code: 'VALIDATION', message: 'Input images must not exceed 20 MiB.'}}, {status: 413});
    return safeError(error);
  }
}
