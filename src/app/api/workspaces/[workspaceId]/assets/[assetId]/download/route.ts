import {NextResponse} from 'next/server';

import {getServerEnv} from '../../../../../../../config/env.ts';
import {getPrivateObjectStore} from '../../../../../../../adapters/storage/runtime.ts';
import {DomainError} from '../../../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../../../lib/auth.ts';
import {authorizeAsset, verifyAssetDownloadToken} from '../../../../../../../modules/assets/authorize.ts';

import {currentWorkspaceActor, safeError, workspaceIdFromParams} from '../../../../_shared.ts';

type RouteContext = {params: Promise<{workspaceId: string; assetId: string}>};
function assertUuid(value: string): string { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new DomainError('VALIDATION', 'assetId must be a UUID.'); return value; }

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const {workspaceId, assetId} = await context.params;
    const workspace = workspaceIdFromParams({workspaceId});
    const id = assertUuid(assetId);
    const token = new URL(request.url).searchParams.get('token');
    if (!token || !verifyAssetDownloadToken(getServerEnv().betterAuthSecret, token, workspace, id)) throw new DomainError('FORBIDDEN', 'The asset download link is invalid or expired.');
    const asset = await authorizeAsset(getAuthDatabase(), workspace, id, actor);
    const bytes = await getPrivateObjectStore().get(asset.objectKey);
    return new NextResponse(new Uint8Array(bytes), {headers: {'content-type': asset.mime ?? 'application/octet-stream', 'cache-control': 'private, no-store'}});
  } catch (error) { return safeError(error); }
}
