import {getServerEnv} from '../../config/env.ts';
import {verifyReferralToken} from './attribution.ts';
import type {ReferralTouch} from './contracts.ts';

/** Only the server-signed first-party cookie can supply a creation candidate. */
export function referralTouchFromRequest(request: Request, now = new Date()): ReferralTouch | null {
  const env = getServerEnv();
  if (!env.affiliateReferralSecret || !env.affiliateProgramId) return null;
  const cookies = request.headers.get('cookie') ?? '';
  if (cookies.length > 16384) return null;
  const tokens = cookies.split(';').map((value) => value.trim()).filter((value) => value.startsWith('shpitto_referral='));
  if (tokens.length !== 1) return null;
  try {
    return verifyReferralToken(decodeURIComponent(tokens[0]!.slice('shpitto_referral='.length)), env.affiliateReferralSecret, {programId: env.affiliateProgramId}, now);
  } catch {
    return null;
  }
}
