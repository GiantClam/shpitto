import { createAuthClient } from 'better-auth/client';
import { AdminContext } from 'react-admin';

const workspaces = new Map([
  ['workspace-a', { id: 'workspace-a', members: new Map([['user-a', 'member']]) }],
  ['workspace-b', { id: 'workspace-b', members: new Map([['user-b', 'member']]) }],
]);

function authorizeWorkspaceRead({ userId, workspaceId, operatorRole = null }) {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) return { allowed: false, reason: 'workspace-not-found' };
  if (operatorRole === 'support_read') return { allowed: true, scope: 'operator-read' };
  if (workspace.members.get(userId)) return { allowed: true, scope: 'member-read' };
  return { allowed: false, reason: 'workspace-membership-required' };
}

const memberRead = authorizeWorkspaceRead({ userId: 'user-a', workspaceId: 'workspace-a' });
const crossTenantRead = authorizeWorkspaceRead({ userId: 'user-a', workspaceId: 'workspace-b' });
const operatorRead = authorizeWorkspaceRead({ userId: 'operator-a', workspaceId: 'workspace-b', operatorRole: 'support_read' });

if (!memberRead.allowed || crossTenantRead.allowed || !operatorRead.allowed) {
  throw new Error('workspace authorization probe failed');
}

if (typeof createAuthClient !== 'function' || typeof AdminContext !== 'function') {
  throw new Error('Better Auth or React-admin contract import failed');
}

console.log(JSON.stringify({
  reactAdminClientContract: true,
  betterAuthClientContract: true,
  memberRead: true,
  crossTenantIdSubstitutionDenied: true,
  operatorReadRequiresExplicitRole: true,
  genericAdminWrites: false,
}));
