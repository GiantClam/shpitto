import {NextResponse} from 'next/server';

import {auth, getAuthDatabase} from '../../../../lib/auth.ts';
import {getServerEnv} from '../../../../config/env.ts';
import {DomainError} from '../../../../db/contracts.ts';
import {readPublicSecuritySettings, readSecuritySettings} from '../../../../modules/security/settings.ts';
import {verifyTurnstile} from '../../../../modules/security/turnstile.ts';

function statusFor(error: unknown): number {
  return error instanceof DomainError ? error.code === 'VALIDATION' ? 400 : error.code === 'FORBIDDEN' ? 403 : error.code === 'INFRASTRUCTURE' ? 503 : 409 : 400;
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { return NextResponse.json({error: 'A valid JSON object is required.'}, {status: 400}); }
    const settings = await readPublicSecuritySettings(getAuthDatabase());
    if (settings.turnstileEnabled) {
      const runtime = await readSecuritySettings(getAuthDatabase());
      await verifyTurnstile(runtime, body.turnstileToken, new URL(getServerEnv().appUrl).hostname, 'email-verification');
    }
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    return await auth.handler(new Request(new URL('/api/auth/send-verification-email', getServerEnv().appUrl), {method: 'POST', headers, body: JSON.stringify(body)}));
  } catch (error) {
    const status = statusFor(error);
    const message = error instanceof DomainError ? error.publicMessage : error instanceof Error && error.message.toLowerCase().includes('security check') ? error.message : 'The verification email could not be requested.';
    return NextResponse.json({error: message}, {status});
  }
}
