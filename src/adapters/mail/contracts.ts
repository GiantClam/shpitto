import type {MailAdapter} from '../contracts.ts';

export type InvitationMailIntent = Readonly<{
  invitationId: string;
  workspaceId: string;
  recipientEmail: string;
  token: string;
  expiresAt: Date;
}>;

export type InvitationMailMessage = Readonly<{
  to: string;
  subject: string;
  body: string;
}>;

export type InvitationMailAdapter = MailAdapter;
