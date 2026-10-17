export type NavigationItem = Readonly<{
  label: string;
  href: string;
  status?: 'preview' | 'planned';
}>;

export const marketingNavigation: readonly NavigationItem[] = [
  {label: 'Home', href: '/'},
  {label: 'Explore', href: '/#explore'},
  {label: 'How it works', href: '/#how-it-works'},
  {label: 'Docs', href: '/docs'},
];

export function getWorkspaceNavigation(workspaceId?: string): readonly NavigationItem[] {
  const dashboard = workspaceId ? `/dashboard?workspace=${encodeURIComponent(workspaceId)}` : '/dashboard';
  return [
    {label: 'Create', href: dashboard},
    {label: 'History', href: `${dashboard}#history`},
    {label: 'Assets', href: `${dashboard}#assets`},
    workspaceId ? {label: 'Members', href: `/workspaces/${encodeURIComponent(workspaceId)}/settings/members`} : {label: 'Team', href: '/dashboard/team'},
    workspaceId ? {label: 'Billing', href: `/workspaces/${encodeURIComponent(workspaceId)}/billing`} : {label: 'Credits', href: `${dashboard}#credits`},
  ];
}

export const workspaceNavigation = getWorkspaceNavigation();

export const adminNavigation: readonly NavigationItem[] = [
  {label: 'Overview', href: '/admin'},
  {label: 'Users', href: '/admin?view=users'},
  {label: 'Generations', href: '/admin?view=generations'},
  {label: 'Billing', href: '/admin?view=billing'},
  {label: 'Audit', href: '/admin?view=audit'},
];
