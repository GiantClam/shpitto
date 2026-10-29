import {randomUUID, timingSafeEqual} from 'node:crypto';
import {and, asc, eq, lte} from 'drizzle-orm';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {semanticHash} from '../../contracts/http.ts';
import {affiliateNotificationInbox} from '../../db/schema/affiliate-inbox.ts';
import {affiliateSettings} from '../../db/schema/affiliate.ts';
import {inTransaction} from '../shared/transaction.ts';
import {reconcileAffiliateWorkspace, refreshAffiliateReview, synchronizeAffiliateAccount, type AffiliateAuthority} from './runtime.ts';

export type AffiliateNotification = Readonly<{eventId: string; eventType: string; entityType: string; entityId: number; action: string; occurredAt: Date}>;
export type AffiliateNotificationReadback = Readonly<{accountId: string; programId: string; eventId: string; entityType: string; entityId: number; complete: boolean; checkedAt: Date; payments: readonly Readonly<{workspaceId: string; paymentReference: string}>[]}>;
export type AffiliateNotificationAuthority = AffiliateAuthority & Readonly<{readNotification?: (input: AffiliateNotification) => Promise<AffiliateNotificationReadback>}>;

export function verifyAffiliateNotificationHeader(header: string | null, secret: string): void {
  if (!secret || !header || header.length > 1024) throw new DomainError('FORBIDDEN', 'Affiliate notification is unauthorized.');
  const supplied = Buffer.from(header); const expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new DomainError('FORBIDDEN', 'Affiliate notification is unauthorized.');
}

/** Only retain the notification signal; personal data and asserted statuses are discarded. */
export function parseAffiliateNotification(value: unknown): AffiliateNotification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('VALIDATION', 'Invalid affiliate notification.');
  const row = value as Record<string, unknown>;
  if (typeof row.event_id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.event_id)
    || !['commission', 'referral', 'promoter'].includes(String(row.entity_type)) || !['created', 'updated', 'deleted'].includes(String(row.action))
    || row.event_type !== `${row.entity_type}.${row.action}` || !Number.isSafeInteger(row.entity_id) || (row.entity_id as number) < 1 || (row.entity_id as number) > 2147483647
    || typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp))) throw new DomainError('VALIDATION', 'Unsupported affiliate notification signal.');
  return {eventId: row.event_id.toLowerCase(), eventType: row.event_type as string, entityType: row.entity_type as string, entityId: row.entity_id as number, action: row.action as string, occurredAt: new Date(row.timestamp)};
}

export async function ingestAffiliateNotification(db: AppDatabase, notification: AffiliateNotification, now = new Date()) {
  return inTransaction(db, async tx => {
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('share').limit(1))[0];
    if (config?.enabled !== 'enabled' || !config.accountId || !config.programId) throw new DomainError('FORBIDDEN', 'Affiliate integration is disabled.');
    const payloadDigest = semanticHash('affiliate.notification', {...notification, accountId: config.accountId, programId: config.programId});
    const inserted = await tx.insert(affiliateNotificationInbox).values({...notification, accountId: config.accountId, programId: config.programId, payloadDigest, nextActionAt: now, receivedAt: now}).onConflictDoNothing().returning({eventId: affiliateNotificationInbox.eventId});
    const stored = (await tx.select().from(affiliateNotificationInbox).where(eq(affiliateNotificationInbox.eventId, notification.eventId)).limit(1))[0]!;
    if (stored.payloadDigest !== payloadDigest) throw new DomainError('CONFLICT', 'Affiliate notification identity changed.');
    return {accepted: true, duplicate: !inserted[0], eventId: stored.eventId, status: stored.status};
  });
}

export async function processAffiliateNotification(db: AppDatabase, eventId: string, authority: AffiliateNotificationAuthority, clock: () => Date = () => new Date()): Promise<string> {
  if (!authority.readNotification) return 'unavailable';
  const claimed = await inTransaction(db, async tx => {
    const now = clock();
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).limit(1))[0];
    const row = (await tx.select().from(affiliateNotificationInbox).where(eq(affiliateNotificationInbox.eventId, eventId)).for('update').limit(1))[0];
    if (config?.enabled !== 'enabled' || !row || row.status === 'processed' || row.accountId !== config.accountId || row.programId !== config.programId || row.nextActionAt > now || row.leaseUntil && row.leaseUntil > now) return null;
    const token = randomUUID();
    await tx.update(affiliateNotificationInbox).set({leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000), attempts: row.attempts + 1}).where(eq(affiliateNotificationInbox.eventId, eventId));
    return {row, token, policyVersion: config.policyVersion};
  });
  if (!claimed) return 'not_ready';
  let verified = false;
  try {
    const remote = await authority.readNotification(claimed.row);
    const age = clock().getTime() - remote.checkedAt.getTime();
    verified = remote.complete && remote.eventId === eventId && remote.entityType === claimed.row.entityType && remote.entityId === claimed.row.entityId && remote.accountId === claimed.row.accountId && remote.programId === claimed.row.programId && Number.isFinite(age) && age >= 0 && age <= 60_000 && remote.payments.length <= 100;
    if (verified) {
      verified = await synchronizeAffiliateAccount(db, authority) === 'succeeded';
      for (const payment of remote.payments) {
        if (!verified) break;
        const status = await reconcileAffiliateWorkspace(db, payment.workspaceId, authority);
        const review = await refreshAffiliateReview(db, {...payment, authority});
        verified = ['ready', 'held', 'older_payment_conflict'].includes(status) && Boolean(review?.refreshedAt);
      }
    }
  } catch { verified = false; }
  return inTransaction(db, async tx => {
    const now = clock();
    const config = (await tx.select().from(affiliateSettings).where(eq(affiliateSettings.id, 'default')).for('share').limit(1))[0];
    const row = (await tx.select().from(affiliateNotificationInbox).where(eq(affiliateNotificationInbox.eventId, eventId)).for('update').limit(1))[0]!;
    if (row.leaseToken !== claimed.token || !row.leaseUntil || row.leaseUntil <= now) return 'stale_lease';
    const current = verified && config?.enabled === 'enabled' && config.accountId === row.accountId && config.programId === row.programId && config.policyVersion === claimed.policyVersion;
    await tx.update(affiliateNotificationInbox).set({status: current ? 'processed' : 'pending', leaseToken: null, leaseUntil: null, nextActionAt: new Date(now.getTime() + 60_000), processedAt: current ? now : null}).where(eq(affiliateNotificationInbox.eventId, eventId));
    return current ? 'processed' : 'pending';
  });
}

export async function drainAffiliateNotifications(db: AppDatabase, authority: AffiliateNotificationAuthority, limit = 25): Promise<number> {
  if (!authority.readNotification) return 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError('VALIDATION', 'Notification batch size is invalid.');
  const rows = await db.select({id: affiliateNotificationInbox.eventId}).from(affiliateNotificationInbox).where(and(eq(affiliateNotificationInbox.status, 'pending'), lte(affiliateNotificationInbox.nextActionAt, new Date()))).orderBy(asc(affiliateNotificationInbox.nextActionAt)).limit(limit);
  let processed = 0;
  for (const row of rows) if (await processAffiliateNotification(db, row.id, authority) === 'processed') processed += 1;
  return processed;
}
