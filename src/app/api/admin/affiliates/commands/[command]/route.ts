import {NextResponse} from 'next/server';

import {serializeJsonValue} from '../../../../../../contracts/http.ts';
import {getAuthDatabase} from '../../../../../../lib/auth.ts';
import {changeAffiliatePolicy, handoffAffiliatePayout, releaseAffiliateAbuseHold, runAffiliateReviewCommand} from '../../../../../../modules/affiliates/commands.ts';
import {createConfiguredAffiliateAuthority} from '../../../../../../modules/affiliates/runtime.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, workspaceErrorResponse} from '../../../../workspaces/_shared.ts';
import {affiliateUuid} from '../../_shared.ts';

export async function POST(request: Request, context: {params: Promise<{command: string}>}) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid) return NextResponse.json({error: 'A valid JSON object is required.'}, {status: 400});
    const {command} = await context.params;
    const body = parsed.body;
    if (typeof body.reason !== 'string' || typeof body.expectedVersion !== 'number' || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) return NextResponse.json({error: 'reason and current expectedVersion are required.'}, {status: 400});
    const common = {actor, reason: body.reason, expectedVersion: body.expectedVersion, idempotencyKey: commandKey(request, body), authority: createConfiguredAffiliateAuthority()};
    const db = getAuthDatabase();
    if (command === 'policy') {
      if ((body.commissionPolicy !== 'first_payment' && body.commissionPolicy !== 'provider_campaign') || typeof body.providerCampaignRevision !== 'string' || typeof body.approvedDashboardOrigin !== 'string' || typeof body.dashboardUrl !== 'string') return NextResponse.json({error: 'A valid commission policy, campaign revision and approved HTTPS dashboard configuration are required.'}, {status: 400});
      return NextResponse.json(serializeJsonValue(await changeAffiliatePolicy(db, {...common, commissionPolicy: body.commissionPolicy, providerCampaignRevision: body.providerCampaignRevision, approvedDashboardOrigin: body.approvedDashboardOrigin, dashboardUrl: body.dashboardUrl})));
    }
    if (command === 'approve' || command === 'deny' || command === 'handoff') {
      const input = {...common, workspaceId: affiliateUuid(body.workspaceId, 'workspaceId'), reviewId: affiliateUuid(body.reviewId, 'reviewId')};
      const result = command === 'handoff' ? await handoffAffiliatePayout(db, input) : await runAffiliateReviewCommand(db, {...input, action: command});
      return NextResponse.json(serializeJsonValue(result));
    }
    if (command === 'release-hold') return NextResponse.json(serializeJsonValue(await releaseAffiliateAbuseHold(db, {...common, workspaceId: affiliateUuid(body.workspaceId, 'workspaceId'), caseId: affiliateUuid(body.caseId, 'caseId')})));
    return NextResponse.json({error: 'Unsupported affiliate command.'}, {status: 404});
  } catch (error) {return workspaceErrorResponse(error);}
}
