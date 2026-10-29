import type {AdapterResult} from '../contracts.ts';
import type {InvitationMailAdapter, InvitationMailMessage} from './contracts.ts';

/** In-memory test fixture. Application delivery uses the configured transport. */
export class LocalMailAdapter implements InvitationMailAdapter {
  readonly messages: InvitationMailMessage[] = [];

  async send(message: InvitationMailMessage): Promise<AdapterResult<void>> {
    this.messages.push({...message});
    return {ok: true, value: undefined};
  }
}
