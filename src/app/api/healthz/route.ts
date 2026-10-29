import {NextResponse} from 'next/server';

import {getRuntimeProfile, getServerEnv} from '../../../config/env.ts';
import {createDatabase} from '../../../db/client.ts';

export const dynamic = 'force-dynamic';

/** Public liveness/readiness probe. It reports no credentials or provider payloads. */
export async function GET() {
  const startedAt = Date.now();
  let database: ReturnType<typeof createDatabase> | null = null;
  try {
    const env = getServerEnv();
    database = createDatabase({max: 1, connectionTimeoutMillis: 1_500});
    await database.pool.query('select 1');
    return NextResponse.json({status: 'ready', profile: getRuntimeProfile(), database: 'ready', latencyMs: Date.now() - startedAt}, {status: 200, headers: {'cache-control': 'no-store'}});
  } catch {
    return NextResponse.json({status: 'not_ready', profile: getRuntimeProfile(), database: 'unavailable'}, {status: 503, headers: {'cache-control': 'no-store'}});
  } finally {
    await database?.pool.end().catch(() => undefined);
  }
}
