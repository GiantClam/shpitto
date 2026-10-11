import {headers} from 'next/headers';

import {AdminEntry} from '../../../admin/admin-entry';
import {DomainError} from '../../../db/contracts';
import {auth, getAuthDatabase} from '../../../lib/auth';
import {requireOperatorIdentity} from '../../../modules/operations/authorize';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth.api.getSession({headers: await headers()});
  if (!session?.user?.id || !session.session?.id) return <main className="page"><p className="eyebrow">Operations</p><h1>Sign in to continue</h1><p>Administration uses your shared account and a separate global role.</p><a className="button" href="/login">Open sign in</a></main>;
  try {
    await requireOperatorIdentity(getAuthDatabase(), {userId: session.user.id, sessionId: session.session.id}, 'support');
  } catch (error) {
    if (!(error instanceof DomainError) || error.code !== 'FORBIDDEN') throw error;
    return <main className="page"><p className="eyebrow">Operations</p><h1>Access unavailable</h1><p>A verified active account with a current global support, operator or superadmin role is required.</p><a className="button" href="/dashboard">Return to workspace</a></main>;
  }
  return <AdminEntry />;
}
