import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {getRuntimeProfile} from '../config/env';

export type LocalDemoCredentials = Readonly<{
  owner: Readonly<{email: string; password: string}>;
  member: Readonly<{email: string; password: string}>;
  workspaceId: string;
  workspaceName: string;
  invitationToken: string;
}>;

const demoFile = join(process.cwd(), '.data', 'demo-credentials.json');

function isCredentials(value: unknown): value is LocalDemoCredentials {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const owner = candidate.owner as Record<string, unknown> | undefined;
  const member = candidate.member as Record<string, unknown> | undefined;
  return typeof candidate.workspaceId === 'string' &&
    typeof candidate.workspaceName === 'string' &&
    typeof candidate.invitationToken === 'string' &&
    typeof owner?.email === 'string' && typeof owner.password === 'string' &&
    typeof member?.email === 'string' && typeof member.password === 'string';
}

/** Local-only acceptance data written by `pnpm demo:seed`; never exposed in production. */
export function readLocalDemoCredentials(): LocalDemoCredentials | null {
  if (getRuntimeProfile() !== 'local') return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(demoFile, 'utf8'));
    return isCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
