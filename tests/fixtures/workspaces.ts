export type FixtureUser = Readonly<{
  id: string;
  name: string;
  email: string;
}>;

export type FixtureWorkspace = Readonly<{
  id: string;
  kind: 'personal' | 'team';
  name: string;
  createdBy: string;
}>;

export const workspaceFixtures = Object.freeze({
  users: {
    A: Object.freeze({id: 'fixture-user-a', name: 'User A', email: 'a@example.test'}),
    B: Object.freeze({id: 'fixture-user-b', name: 'User B', email: 'b@example.test'}),
    C: Object.freeze({id: 'fixture-user-c', name: 'User C', email: 'c@example.test'}),
  } satisfies Record<'A' | 'B' | 'C', FixtureUser>,
  workspaces: {
    W1: Object.freeze({id: '00000000-0000-4000-8000-000000000001', kind: 'personal', name: 'Workspace W1', createdBy: 'fixture-user-a'}),
    W2: Object.freeze({id: '00000000-0000-4000-8000-000000000002', kind: 'team', name: 'Workspace W2', createdBy: 'fixture-user-b'}),
  } satisfies Record<'W1' | 'W2', FixtureWorkspace>,
  creditGrants: {
    W1: Object.freeze({id: '00000000-0000-4000-8000-000000000101', workspaceId: '00000000-0000-4000-8000-000000000001', amount: '100'}),
    W2: Object.freeze({id: '00000000-0000-4000-8000-000000000102', workspaceId: '00000000-0000-4000-8000-000000000002', amount: '200'}),
  },
} as const);

export function assertSameWorkspaceLineage(workspaceId: string, referencedWorkspaceId: string): void {
  if (workspaceId !== referencedWorkspaceId) {
    throw new Error('Tenant lineage cannot cross workspaces.');
  }
}
