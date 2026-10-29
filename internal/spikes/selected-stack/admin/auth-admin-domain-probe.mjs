import { betterAuth } from 'better-auth/minimal';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { bearer } from 'better-auth/plugins/bearer';
import { createAuthClient } from 'better-auth/client';
import { AdminContext } from 'react-admin';

const database = memoryAdapter({ user: [], session: [], account: [], verification: [] });
const auth = betterAuth({
  database,
  secret: 'm0-disposable-secret-that-is-long-enough',
  baseURL: 'http://localhost:3000',
  emailAndPassword: { enabled: true },
  plugins: [bearer()],
});

const signUp = await auth.api.signUpEmail({
  body: { email: 'admin-slice@example.test', password: 'M0-password-123!', name: 'Admin Slice' },
});
const signIn = await auth.api.signInEmail({
  body: { email: 'admin-slice@example.test', password: 'M0-password-123!' },
});
const token = signIn.token ?? signIn.session?.token ?? signIn.data?.session?.token;
if (!signUp?.user?.id || !token) throw new Error('Better Auth session setup failed');

const session = await auth.api.getSession({
  headers: new Headers({ authorization: `Bearer ${token}` }),
});
const userId = session?.session?.userId ?? session?.data?.session?.userId;
if (!userId) throw new Error('Better Auth session lookup failed');

const state = {
  operators: new Map(),
  workspaces: new Map([
    ['workspace-a', new Set([userId])],
    ['workspace-b', new Set(['other-user'])],
  ]),
};

function authorize({ userId: subject, workspaceId }) {
  const workspaceMembers = state.workspaces.get(workspaceId);
  if (!workspaceMembers) return { allowed: false, reason: 'workspace-not-found' };
  const role = state.operators.get(subject);
  if (role === 'support_read') return { allowed: true, scope: 'operator-read' };
  if (workspaceMembers.has(subject)) return { allowed: true, scope: 'member-read' };
  return { allowed: false, reason: 'workspace-membership-required' };
}

const memberRead = authorize({ userId, workspaceId: 'workspace-a' });
const crossTenantRead = authorize({ userId, workspaceId: 'workspace-b' });
state.operators.set(userId, 'support_read');
const operatorRead = authorize({ userId, workspaceId: 'workspace-b' });
state.operators.delete(userId);
const revokedRead = authorize({ userId, workspaceId: 'workspace-b' });

if (!memberRead.allowed || crossTenantRead.allowed || !operatorRead.allowed || revokedRead.allowed) {
  throw new Error('auth/admin/domain authorization probe failed');
}
if (typeof AdminContext !== 'function' || typeof createAuthClient !== 'function') {
  throw new Error('React-admin or Better Auth client contract import failed');
}

console.log(JSON.stringify({
  sessionAuthenticated: true,
  sessionDoesNotGrantGlobalOperator: true,
  memberRead: true,
  crossTenantIdSubstitutionDenied: true,
  explicitOperatorRead: true,
  roleRevocationObservedOnNextRequest: true,
  reactAdminClientContract: true,
  genericAdminWrites: false,
}));
