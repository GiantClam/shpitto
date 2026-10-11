import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';
import {
  requireCurrentMembership,
  requireCurrentOwner,
  type WorkspaceAccess,
  type WorkspaceActor,
} from './policy.ts';

type WorkspaceAuthorizationDatabase = AppDatabase | TransactionDatabase;

/**
 * Resolve membership from current server-side rows for every private workspace
 * operation. A valid session alone never grants tenant access.
 */
export async function authorizeWorkspaceAccess(
  db: WorkspaceAuthorizationDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
): Promise<WorkspaceAccess> {
  let access: WorkspaceAccess;
  try {
    access = await requireCurrentMembership(db, workspaceId, actor);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      throw new DomainError('FORBIDDEN', 'Workspace is not available.');
    }
    throw error;
  }
  if (access.workspace.status !== 'active') {
    throw new DomainError('FORBIDDEN', 'This workspace is not active.');
  }
  return access;
}

/** Resolve a current owner while retaining the transaction lock used by commands. */
export async function authorizeWorkspaceOwner(
  tx: TransactionDatabase,
  workspaceId: string,
  actor: WorkspaceActor,
): Promise<WorkspaceAccess> {
  try {
    return await requireCurrentOwner(tx, workspaceId, actor);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      throw new DomainError('FORBIDDEN', 'Workspace is not available.');
    }
    throw error;
  }
}

/**
 * Bind a resource lookup to the workspace already authorized for the request.
 * Resource IDs are never accepted as an alternate tenant selector.
 */
export function assertWorkspaceResource(
  access: WorkspaceAccess,
  resourceWorkspaceId: string,
): void {
  if (access.workspace.id !== resourceWorkspaceId) {
    throw new DomainError('FORBIDDEN', 'Workspace resource is not available.');
  }
}

export async function authorizeWorkspaceResource(
  db: WorkspaceAuthorizationDatabase,
  workspaceId: string,
  resourceWorkspaceId: string,
  actor: WorkspaceActor,
): Promise<WorkspaceAccess> {
  const access = await authorizeWorkspaceAccess(db, workspaceId, actor);
  assertWorkspaceResource(access, resourceWorkspaceId);
  return access;
}
