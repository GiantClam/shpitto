import {NextResponse} from 'next/server';

import {auth, getAuthDatabase} from '../../../lib/auth.ts';
import {getRuntimeProfile} from '../../../config/env.ts';
import {completePersonalWorkspaceOnboarding} from '../../../modules/workspaces/onboard.ts';
import {referralTouchFromRequest} from '../../../modules/affiliates/request.ts';
import {assertSameOrigin, workspaceErrorResponse} from '../workspaces/_shared.ts';
import {commandKeyFromRequest, parseJsonObject} from '../../../contracts/http.ts';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ok: false, error: {code: 'FORBIDDEN', message: 'A same-origin or CSRF-protected request is required.'}}, {status: 403});
  }
  const session = await auth.api.getSession({headers: request.headers});
  const userId = session?.user?.id ?? session?.session?.userId;
  if (!userId) return NextResponse.json({error: 'Authentication required.'}, {status: 401});

  let workspaceName = 'Personal workspace';
  let body: Record<string, unknown> = {};
  try {
    body = parseJsonObject(await request.text()) as Record<string, unknown>;
    if (body.workspaceName !== undefined) {
      if (typeof body.workspaceName !== 'string') {
        return NextResponse.json({error: 'workspaceName must be a string.'}, {status: 400});
      }
      const candidate = body.workspaceName.trim();
      if (candidate.length < 1 || candidate.length > 100 || /[\u0000-\u001f\u007f]/.test(candidate)) {
        return NextResponse.json({error: 'workspaceName must be 1-100 characters without control characters.'}, {status: 400});
      }
      workspaceName = candidate;
    }
  } catch {
    return NextResponse.json({ok: false, error: {code: 'VALIDATION', message: 'A valid JSON object is required.'}}, {status: 400});
  }
  let idempotencyKey: string;
  try {
    idempotencyKey = commandKeyFromRequest(request, body);
  } catch {
    return NextResponse.json({ok: false, error: {code: 'VALIDATION', message: 'A valid Idempotency-Key is required.'}}, {status: 400});
  }

  try {
    const profile = getRuntimeProfile();
    const result = await completePersonalWorkspaceOnboarding(getAuthDatabase(), userId, workspaceName, {idempotencyKey, fundDemoCredits: profile === 'local', profile: profile === 'acceptance' ? 'test' : profile, referralTouch: referralTouchFromRequest(request)});
    return NextResponse.json(result, {status: result.created && !result.replayed ? 201 : 200});
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
