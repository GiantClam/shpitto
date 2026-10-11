import {getServerEnv} from '../../config/env.ts';
import type {AdapterResult, MailAdapter} from '../contracts.ts';

/** Local capture transport; messages remain inside the configured Mailpit instance. */
export class MailpitMailAdapter implements MailAdapter {
  private readonly endpoint: URL;

  constructor(baseUrl: string) {
    this.endpoint = new URL('/api/v1/send', baseUrl);
    if (!['http:', 'https:'].includes(this.endpoint.protocol)) throw new Error('Mailpit requires an HTTP URL.');
  }

  async send(message: Readonly<{to: string; subject: string; body: string}>): Promise<AdapterResult<void>> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          From: {Email: 'no-reply@shpitto.local', Name: 'Shpitto'},
          To: [{Email: message.to}],
          Subject: message.subject,
          Text: message.body,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return {ok: false, error: {code: 'MAIL_DELIVERY_FAILED', retryable: response.status >= 500 || response.status === 429, message: 'Email delivery is temporarily unavailable.'}};
      return {ok: true, value: undefined};
    } catch {
      return {ok: false, error: {code: 'MAIL_DELIVERY_FAILED', retryable: true, message: 'Email delivery is temporarily unavailable.'}};
    }
  }
}

/** Production transports must be explicitly implemented; local capture cannot masquerade as delivery. */
export function createConfiguredMailAdapter(): MailAdapter {
  const env = getServerEnv();
  if (env.nodeEnv === 'production' || env.mailDriver !== 'local') {
    return {
      send: async () => ({ok: false, error: {code: 'MAIL_DRIVER_UNAVAILABLE', retryable: false, message: 'The configured email transport is unavailable.'}}),
    };
  }
  return new MailpitMailAdapter(env.mailHttpUrl);
}
