import {APIError} from 'better-auth';

import type {RuntimeSecuritySettings} from './settings.ts';

type TurnstileResponse = Readonly<{success?: boolean; hostname?: string; action?: string}>;

export async function verifyTurnstile(settings: RuntimeSecuritySettings, token: unknown, expectedHostname: string, expectedAction: string): Promise<void> {
  if (!settings.turnstileEnabled) return;
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) throw APIError.from('BAD_REQUEST', {code: 'TURNSTILE_REQUIRED', message: 'Complete the security check and try again.'});
  if (!settings.turnstileSecretKey) throw APIError.from('SERVICE_UNAVAILABLE', {code: 'TURNSTILE_UNAVAILABLE', message: 'The security check is not configured.'});
  try {
    const body = new URLSearchParams({secret: settings.turnstileSecretKey, response: token});
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body, signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('Turnstile verification failed.');
    const result = await response.json() as TurnstileResponse;
    if (result.success !== true || result.hostname !== expectedHostname || result.action !== expectedAction) throw new Error('Turnstile verification rejected.');
  } catch {
    throw APIError.from('FORBIDDEN', {code: 'TURNSTILE_FAILED', message: 'The security check could not be verified.'});
  }
}
