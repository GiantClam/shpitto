import {adminRequest} from './http.ts';

type Envelope = Readonly<{reason: string; expectedVersion: number; idempotencyKey: string}>;
export type AffiliateAdminCommand = Envelope & (
  | Readonly<{command: 'approve' | 'deny' | 'handoff'; workspaceId: string; reviewId: string}>
  | Readonly<{command: 'release-hold'; workspaceId: string; caseId: string}>
  | Readonly<{command: 'policy'; commissionPolicy: 'first_payment' | 'provider_campaign'; providerCampaignRevision: string; approvedDashboardOrigin: string; dashboardUrl: string}>
);

export async function executeAffiliateAdminCommand(input: AffiliateAdminCommand): Promise<Record<string, unknown>> {
  const {command, idempotencyKey, ...body} = input;
  if (!['approve', 'deny', 'handoff', 'release-hold', 'policy'].includes(command)) throw new Error('Unsupported affiliate command.');
  if (!idempotencyKey.trim() || !body.reason.trim() || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) throw new Error('A reason, current version and stable command key are required.');
  return adminRequest(`/api/admin/affiliates/commands/${command}`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey}, body: JSON.stringify(body)});
}
