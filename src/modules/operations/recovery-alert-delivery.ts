import {createHash, timingSafeEqual} from 'node:crypto';
import {DomainError} from '../../db/contracts.ts';

export const RECOVERY_ACTION = 'Restore the assigned worker/database; drain overdue tasks before dispatch. Never reset submission fences.';
export type RecoveryAlert = Readonly<{
  incidentId: string; workspaceId: string; workerKey: string; code: 'sweep_heartbeat_missing';
  expectedAt: string; observedAt: string; lastSweepAt: string | null; ageSeconds: number; action: string;
}>;
export type RecoveryAlertConfig = Readonly<{
  projectId: string; expectedProjectId: string; profile: string; workspaceId: string; workerKey: string;
  secret: string; appUrl: string; alertUrl: string;
}>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEYS = ['incidentId', 'workspaceId', 'workerKey', 'code', 'expectedAt', 'observedAt', 'lastSweepAt', 'ageSeconds', 'action'];

/** Reject free-form operational payloads: only this correlated, secret-free contract is delivered. */
export function validateRecoveryAlert(value: unknown): RecoveryAlert {
  const p = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(p).length !== KEYS.length || Object.keys(p).some((k) => !KEYS.includes(k)) ||
    typeof p.incidentId !== 'string' || !UUID.test(p.incidentId) || typeof p.workspaceId !== 'string' || !UUID.test(p.workspaceId) ||
    typeof p.workerKey !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(p.workerKey) || p.code !== 'sweep_heartbeat_missing' ||
    typeof p.expectedAt !== 'string' || p.expectedAt.length > 30 || !Number.isFinite(Date.parse(p.expectedAt)) ||
    typeof p.observedAt !== 'string' || p.observedAt.length > 30 || !Number.isFinite(Date.parse(p.observedAt)) ||
    !(p.lastSweepAt === null || typeof p.lastSweepAt === 'string' && p.lastSweepAt.length <= 30 && Number.isFinite(Date.parse(p.lastSweepAt)) && Date.parse(p.lastSweepAt) <= Date.parse(p.observedAt)) ||
    !Number.isInteger(p.ageSeconds) || Number(p.ageSeconds) < 180 || Number(p.ageSeconds) > 31_536_000 || p.action !== RECOVERY_ACTION) {
    throw new DomainError('VALIDATION', 'Recovery alert must contain only bounded correlated evidence.');
  }
  const baseline = Math.max(Date.parse(p.expectedAt), p.lastSweepAt === null ? -Infinity : Date.parse(p.lastSweepAt));
  const ageMs = Date.parse(p.observedAt) - baseline;
  if (ageMs <= 180_000 || Math.min(31_536_000, Math.floor(ageMs / 1000)) !== p.ageSeconds) throw new DomainError('VALIDATION', 'Recovery alert timestamps and stale duration disagree.');
  return Object.freeze({incidentId: p.incidentId, workspaceId: p.workspaceId, workerKey: p.workerKey, code: 'sweep_heartbeat_missing', expectedAt: p.expectedAt, observedAt: p.observedAt, lastSweepAt: p.lastSweepAt, ageSeconds: Number(p.ageSeconds), action: RECOVERY_ACTION});
}

export function authorizeRecoveryAlertHeaders(authorization: string, config: RecoveryAlertConfig): void {
  if (config.profile !== 'acceptance' || !config.projectId || config.projectId !== config.expectedProjectId ||
    !UUID.test(config.workspaceId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.workerKey) || config.secret.length < 32 || config.secret.length > 512) {
    throw new DomainError('FORBIDDEN', 'Recovery alert recipient is not bound to the isolated scope.');
  }
  const hash = (text: string) => createHash('sha256').update(text).digest();
  if (!timingSafeEqual(hash(authorization), hash(`Bearer ${config.secret}`))) throw new DomainError('FORBIDDEN', 'Recovery alert authentication failed.');
}

export function authorizeRecoveryAlert(payload: RecoveryAlert, authorization: string, config: RecoveryAlertConfig): void {
  authorizeRecoveryAlertHeaders(authorization, config);
  if (payload.workspaceId !== config.workspaceId || payload.workerKey !== config.workerKey) throw new DomainError('FORBIDDEN', 'Recovery alert does not match the assigned recipient scope.');
}

export async function readRecoveryAlertBody(body: Request | Response, timeoutMs = 5_000): Promise<Uint8Array> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new DomainError('VALIDATION', 'Recovery alert read timeout is invalid.');
  if (Number(body.headers.get('content-length') ?? 0) > 4096 || !body.body) throw new DomainError('VALIDATION', 'Recovery alert body is too large or empty.');
  const reader = body.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new DomainError('VALIDATION', 'Recovery alert body read timed out.')), timeoutMs);});
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 4096) throw new DomainError('VALIDATION', 'Recovery alert body is too large.');
      chunks.push(chunk.value);
    }
  } finally { clearTimeout(timer!); void reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks);
}

/** An HTTP acknowledgement must refer to the durable recipient record, not merely a successful socket write. */
export async function deliverRecoveryAlert(value: RecoveryAlert, config: RecoveryAlertConfig, send: typeof fetch = fetch): Promise<void> {
  const payload = validateRecoveryAlert(value);
  authorizeRecoveryAlert(payload, `Bearer ${config.secret}`, config);
  let url: URL;
  try { url = new URL(config.alertUrl); } catch { throw new DomainError('VALIDATION', 'Recovery alert URL is invalid.'); }
  if (url.protocol !== 'https:' || url.origin !== new URL(config.appUrl).origin || url.pathname !== '/api/internal/recovery-alerts' || url.username || url.password || url.search || url.hash) throw new DomainError('FORBIDDEN', 'Recovery alerts require the assigned application HTTPS recipient.');
  try {
    const response = await send(url, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: {'content-type': 'application/json', authorization: `Bearer ${config.secret}`, 'idempotency-key': payload.incidentId}, body: JSON.stringify(payload)});
    if (!response.ok) throw new Error('delivery failed');
    const receipt = JSON.parse(new TextDecoder().decode(await readRecoveryAlertBody(response))) as {ok?: unknown; data?: {incidentId?: unknown; received?: unknown}};
    if (receipt.ok !== true || receipt.data?.incidentId !== payload.incidentId || receipt.data.received !== true) throw new Error('receipt mismatch');
  } catch { throw new DomainError('INFRASTRUCTURE', 'Recovery alert delivery failed; the durable incident remains retryable.'); }
}
