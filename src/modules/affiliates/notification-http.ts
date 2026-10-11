import {failure} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {ingestAffiliateNotification, parseAffiliateNotification, verifyAffiliateNotificationHeader} from './notifications.ts';

type NotificationHttpDependencies = Readonly<{secret: string; production: boolean; getDatabase: () => AppDatabase}>;

async function boundedBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('VALIDATION', 'Notification body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) {await reader.cancel(); throw new DomainError('VALIDATION', 'Notification body is too large.');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new DomainError('VALIDATION', 'Notification body must be JSON.');}
}

/** Shared by the Next route and isolated HTTP probe; resolve the database only after authentication and parsing. */
export async function handleAffiliateNotification(request: Request, dependencies: NotificationHttpDependencies): Promise<Response> {
  if (!dependencies.secret || new URL(request.url).protocol !== 'https:' && dependencies.production) return Response.json({error: 'Affiliate webhook is unavailable.'}, {status: 404});
  try {verifyAffiliateNotificationHeader(request.headers.get('authorization'), dependencies.secret);}
  catch {return Response.json({error: 'Unauthorized.'}, {status: 401});}
  try {
    const notification = parseAffiliateNotification(await boundedBody(request));
    const eventHeader = request.headers.get('x-event-id');
    const typeHeader = request.headers.get('x-event-type');
    if (eventHeader && eventHeader.toLowerCase() !== notification.eventId || typeHeader && typeHeader !== notification.eventType) throw new DomainError('VALIDATION', 'Notification header identity does not match.');
    const result = await ingestAffiliateNotification(dependencies.getDatabase(), notification);
    return Response.json(result, {status: result.duplicate ? 200 : 202});
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : error.code === 'VALIDATION' ? 400 : 500;
      return Response.json(failure(error.code, error.publicMessage), {status});
    }
    return Response.json(failure('INTERNAL_ERROR', 'The request could not be completed.'), {status: 500});
  }
}
