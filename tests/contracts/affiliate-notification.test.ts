import {deepEqual, throws} from 'node:assert/strict';
import {test} from 'node:test';
import {parseAffiliateNotification, verifyAffiliateNotificationHeader} from '../../src/modules/affiliates/notifications.ts';

const body = {event_id: '38fb5978-40a1-40b3-ad86-302df82c06d5', event_type: 'commission.updated', entity_type: 'commission', entity_id: 42, action: 'updated', timestamp: '2026-10-04T00:00:00Z', data: {status: 'approved', email: 'not-retained@example.test'}};
test('notification parsing retains only a bounded signal and never provider-supplied approval or PII', () => {
  deepEqual(parseAffiliateNotification(body), {eventId: body.event_id, eventType: 'commission.updated', entityType: 'commission', entityId: 42, action: 'updated', occurredAt: new Date(body.timestamp)});
  for (const patch of [{event_id: 'invalid'}, {entity_id: -1}, {timestamp: 'never'}, {entity_type: 'unexpected'}, {event_type: 'commission.created'}, {action: 'paid'}]) throws(() => parseAffiliateNotification({...body, ...patch}));
});
test('notification authorization rejects missing, wrong and oversized shared secrets', () => {
  verifyAffiliateNotificationHeader('Bearer local-notification-secret', 'local-notification-secret');
  for (const header of [null, 'Bearer wrong', 'Bearer '+ 'a'.repeat(4096)]) throws(() => verifyAffiliateNotificationHeader(header, 'local-notification-secret'));
  throws(() => verifyAffiliateNotificationHeader('Bearer ', ''));
});
