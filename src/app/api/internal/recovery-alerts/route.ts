import {getRecoveryMonitorEnvironment} from '../../../../config/env.ts';
import {DomainError} from '../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../lib/auth.ts';
import {authorizeRecoveryAlert, authorizeRecoveryAlertHeaders, readRecoveryAlertBody, validateRecoveryAlert} from '../../../../modules/operations/recovery-alert-delivery.ts';
import {receiveRecoveryAlert} from '../../../../modules/operations/recovery-alert-inbox.ts';
import {safeError, safeSuccess} from '../../workspaces/_shared.ts';

export const runtime = 'nodejs';

/** Dedicated bearer authentication: cookies and browser-origin sessions do not authorize this internal receiver. */
export async function POST(request: Request) {
  try {
    const config = getRecoveryMonitorEnvironment();
    if (config.mode !== 'observe') throw new DomainError('FORBIDDEN', 'Recovery alert receiver is disabled.');
    authorizeRecoveryAlertHeaders(request.headers.get('authorization') ?? '', config);
    const payload = validateRecoveryAlert(JSON.parse(new TextDecoder().decode(await readRecoveryAlertBody(request))));
    authorizeRecoveryAlert(payload, request.headers.get('authorization') ?? '', config);
    if (request.headers.get('idempotency-key') !== payload.incidentId) throw new DomainError('VALIDATION', 'Recovery alert requires its stable incident key.');
    const receipt = await receiveRecoveryAlert(getAuthDatabase(), payload);
    console.warn(JSON.stringify({event: 'sweep-heartbeat-alert-received', incidentId: payload.incidentId, workspaceId: payload.workspaceId, workerKey: payload.workerKey, action: payload.action, duplicate: receipt.duplicate}));
    return safeSuccess(receipt, receipt.duplicate ? 200 : 202);
  } catch (error) { return safeError(error); }
}
