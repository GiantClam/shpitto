import {adminRequest} from './http.ts';

export type AdminCommand = 'workspace-status' | 'disable-user' | 'role' | 'credit-adjust' | 'refund' | 'recovery-sweep' | 'webhook-replay';
type Envelope = Readonly<{reason: string; expectedVersion: number; idempotencyKey: string}>;
export type AdminCommandInput = Envelope & (
  | Readonly<{command: 'workspace-status'; workspaceId: string; status: 'active' | 'suspended'}>
  | Readonly<{command: 'disable-user'; targetUserId: string}>
  | Readonly<{command: 'role'; targetUserId: string; role: 'support' | 'operator' | 'superadmin' | null}>
  | Readonly<{command: 'credit-adjust'; workspaceId: string; amount: string; grantId?: string}>
  | Readonly<{command: 'refund'; workspaceId: string; orderId: string; purpose: string; amountMinor?: string}>
  | Readonly<{command: 'recovery-sweep'; workspaceId: string}>
  | Readonly<{command: 'webhook-replay'; workspaceId: string; inboxId: string}>
);

/** The caller keeps the key for retries and creates a new key for new semantics. */
export async function executeAdminCommand(input: AdminCommandInput): Promise<Record<string, unknown>> {
  const {command, idempotencyKey, ...body} = input;
  if (!['workspace-status', 'disable-user', 'role', 'credit-adjust', 'refund', 'recovery-sweep', 'webhook-replay'].includes(command)) throw new Error('Unsupported admin command.');
  if (!idempotencyKey.trim() || !body.reason.trim() || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) throw new Error('Reason, current expected version and a stable command key are required.');
  if (input.command === 'recovery-sweep') return adminRequest(`/api/admin/recovery/${encodeURIComponent(input.workspaceId)}/sweep`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey}, body: JSON.stringify({purpose: input.reason, expectedVersion: input.expectedVersion})});
  if (input.command === 'webhook-replay') return adminRequest(`/api/admin/recovery/${encodeURIComponent(input.workspaceId)}/webhook-replay`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey}, body: JSON.stringify({purpose: input.reason, expectedVersion: input.expectedVersion, inboxId: input.inboxId})});
  return adminRequest(`/api/admin/commands/${command}`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey}, body: JSON.stringify(body)});
}

export async function readAdminRecovery(workspaceId: string, purpose: string): Promise<Record<string, unknown>> {
  if (!workspaceId.trim() || !purpose.trim()) throw new Error('Workspace and access purpose are required.');
  return adminRequest(`/api/admin/recovery/${encodeURIComponent(workspaceId)}?${new URLSearchParams({purpose})}`);
}

export async function previewAdminRefund(input: Readonly<{workspaceId: string; orderId: string; purpose: string; amountMinor?: string}>): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({workspaceId: input.workspaceId, orderId: input.orderId, purpose: input.purpose});
  if (input.amountMinor) query.set('amountMinor', input.amountMinor);
  return adminRequest(`/api/admin/refunds/preview?${query}`);
}
