import type {InvitationMailIntent, InvitationMailMessage} from './contracts.ts';

/** Converts a committed invitation intent into a delivery message at send time. */
export function toInvitationMailMessage(intent: InvitationMailIntent, appUrl: string): InvitationMailMessage {
  const url = new URL('/invitations/accept', appUrl);
  url.searchParams.set('token', intent.token);
  return {
    to: intent.recipientEmail,
    subject: 'You have been invited to a Shpitto team workspace',
    body: `Accept the invitation: ${url.toString()}\n\nThis invitation expires on ${intent.expiresAt.toISOString()}.`,
  };
}
