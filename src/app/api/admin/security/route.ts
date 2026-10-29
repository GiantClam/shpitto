import {eq} from 'drizzle-orm';
import {NextResponse} from 'next/server';

import {authUser} from '../../../../db/schema/auth.ts';
import {DomainError} from '../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../lib/auth.ts';
import {requireCurrentOperator, requireOperatorIdentity, requireTrustedStepUp} from '../../../../modules/operations/authorize.ts';
import {readSecuritySettings} from '../../../../modules/security/settings.ts';
import {currentWorkspaceActor, workspaceErrorResponse} from '../../workspaces/_shared.ts';

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const db = getAuthDatabase();
    const identity = await requireOperatorIdentity(db, actor, 'support');
    const settings = await readSecuritySettings(db);
    const user = (await db.select({twoFactorEnabled: authUser.twoFactorEnabled}).from(authUser).where(eq(authUser.id, actor.userId)).limit(1))[0];
    let mfaComplete = false;
    let stepUpExpiresAt: string | null = null;
    try {
      await requireCurrentOperator(db, actor, 'support');
      mfaComplete = true;
      stepUpExpiresAt = (await requireTrustedStepUp(db, actor)).toISOString();
    } catch (error) { if (!(error instanceof DomainError && error.code === 'FORBIDDEN')) throw error; }
    return NextResponse.json({userId: identity.userId, role: identity.role, twoFactorEnabled: user?.twoFactorEnabled ?? false, twoFactorRequired: settings.twoFactorRequired, mfaComplete, stepUpExpiresAt});
  } catch (error) { return workspaceErrorResponse(error); }
}
