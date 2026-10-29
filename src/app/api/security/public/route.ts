import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../lib/auth.ts';
import {readPublicAuthSecuritySettings} from '../../../../modules/security/settings.ts';

export async function GET() {
  const settings = await readPublicAuthSecuritySettings(getAuthDatabase());
  return NextResponse.json(settings, {headers: {'cache-control': 'no-store'}});
}
