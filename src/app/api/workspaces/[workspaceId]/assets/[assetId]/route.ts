import {NextResponse} from 'next/server';

import {getServerEnv} from '../../../../../../config/env.ts';
import {getPrivateObjectStore} from '../../../../../../adapters/storage/runtime.ts';
import {DomainError} from '../../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../../lib/auth.ts';
import {authorizeAsset, createAssetDownloadToken, deleteAsset} from '../../../../../../modules/assets/authorize.ts';
import {assertSameOrigin, currentWorkspaceActor, safeError, safeSuccess, workspaceIdFromParams} from '../../../_shared.ts';

type RouteContext = {params: Promise<{workspaceId: string; assetId: string}>};
function assertUuid(value: string, field: string): string { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new DomainError('VALIDATION', `${field} must be a UUID.`); return value; }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await currentWorkspaceActor(_request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const {workspaceId, assetId} = await context.params;
    const workspace = workspaceIdFromParams({workspaceId});
    const asset = await authorizeAsset(getAuthDatabase(), workspace, assertUuid(assetId, 'assetId'), actor);
    const token = createAssetDownloadToken(getServerEnv().betterAuthSecret, workspace, asset.id);
    return safeSuccess({assetId: asset.id, state: asset.state, mime: asset.mime, bytes: asset.bytes?.toString() ?? null, downloadExpiresAt: token.expiresAt, downloadUrl: `/api/workspaces/${workspace}/assets/${asset.id}/download?token=${encodeURIComponent(token.token)}`});
  } catch (error) { return safeError(error); }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const {workspaceId, assetId} = await context.params;
    const workspace = workspaceIdFromParams({workspaceId});
    await deleteAsset(getAuthDatabase(), workspace, assertUuid(assetId, 'assetId'), actor, undefined, new Date(), getPrivateObjectStore());
    return safeSuccess({deleted: true});
  } catch (error) { return safeError(error); }
}
