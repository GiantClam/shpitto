import {NextResponse} from 'next/server';

import {commandKey, assertSameOrigin, currentWorkspaceActor, readJson, workspaceErrorResponse} from '../../../workspaces/_shared.ts';
import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {adjustWorkspaceCredits, disableOperatorUser, setOperatorRole, setWorkspaceAdminStatus} from '../../../../../modules/operations/commands.ts';
import {requestBillingRefundAsOperator} from '../../../../../modules/billing/refund-command.ts';

export async function POST(request: Request, context: {params: Promise<{command: string}>}) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid) return NextResponse.json({error: 'A valid JSON object is required.'}, {status: 400});
    const body = parsed.body;
    const {command} = await context.params;
    const db = getAuthDatabase();
    const idempotencyKey = commandKey(request, body);
    const reason = body.reason;
    const expectedVersion = typeof body.expectedVersion === 'number' ? body.expectedVersion : NaN;
    if (typeof reason !== 'string' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return NextResponse.json({error: 'reason and nonnegative expectedVersion are required.'}, {status: 400});
    if (command === 'refund') {
      if (typeof body.workspaceId !== 'string' || typeof body.orderId !== 'string' || typeof reason !== 'string' || typeof body.purpose !== 'string' || (body.amountMinor !== undefined && (typeof body.amountMinor !== 'string' || !/^[0-9]+$/.test(body.amountMinor)))) return NextResponse.json({error: 'workspaceId, orderId, reason and purpose are required.'}, {status: 400});
      const result = await requestBillingRefundAsOperator(db, {actor, workspaceId: body.workspaceId, orderId: body.orderId, expectedVersion, amountMinor: body.amountMinor === undefined ? undefined : BigInt(body.amountMinor), idempotencyKey, reason, purpose: body.purpose});
      return NextResponse.json({...result, amountMinor: result.amountMinor.toString()});
    }
    if (command === 'role') {
      if (typeof body.targetUserId !== 'string' || (body.role !== null && body.role !== 'support' && body.role !== 'operator' && body.role !== 'superadmin')) return NextResponse.json({error: 'targetUserId and a valid role are required.'}, {status: 400});
      return NextResponse.json(await setOperatorRole(db, {actor, targetUserId: body.targetUserId, role: body.role, expectedVersion, idempotencyKey, reason}));
    }
    if (command === 'disable-user') {
      if (typeof body.targetUserId !== 'string') return NextResponse.json({error: 'targetUserId is required.'}, {status: 400});
      return NextResponse.json(await disableOperatorUser(db, {actor, targetUserId: body.targetUserId, expectedVersion, idempotencyKey, reason}));
    }
    if (command === 'workspace-status') {
      if (typeof body.workspaceId !== 'string' || (body.status !== 'active' && body.status !== 'suspended')) return NextResponse.json({error: 'workspaceId and a valid status are required.'}, {status: 400});
      return NextResponse.json(await setWorkspaceAdminStatus(db, {actor, workspaceId: body.workspaceId, status: body.status, expectedVersion, idempotencyKey, reason}));
    }
    if (command === 'credit-adjust') {
      if (typeof body.workspaceId !== 'string' || typeof body.amount !== 'string' || !/^-?[0-9]+$/.test(body.amount)) return NextResponse.json({error: 'workspaceId and decimal amount are required.'}, {status: 400});
      return NextResponse.json(await adjustWorkspaceCredits(db, {actor, workspaceId: body.workspaceId, grantId: typeof body.grantId === 'string' ? body.grantId : undefined, amount: BigInt(body.amount), expectedVersion, idempotencyKey, reason}), {status: 200});
    }
    return NextResponse.json({error: 'Unsupported admin command.'}, {status: 404});
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
