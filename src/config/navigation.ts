import type {MediaIconName} from '../components/creation/media-icon';
import type {OperatorRole} from '../admin/capabilities';

export type NavigationItem = Readonly<{
  label: string;
  href: string;
  status?: 'preview' | 'planned';
  icon?: MediaIconName;
}>;

export const marketingNavigation: readonly NavigationItem[] = [
  {label: 'Home', href: '/'},
  {label: 'Explore', href: '/#explore'},
  {label: 'Create', href: '/#create'},
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

export const creatorNavigation: readonly NavigationItem[] = [
  {label: 'Create', href: '/#create', icon: 'spark'},
  {label: 'My creations', href: '/dashboard#history', icon: 'folder'},
  {label: 'Explore', href: '/#explore', icon: 'grid'},
];

export const workspaceNavigation = getWorkspaceNavigation();

export type AdminNavigationItem = Readonly<NavigationItem & {id: string; roles?: readonly OperatorRole[]}>;

export const adminNavigation: readonly AdminNavigationItem[] = [
  {id: 'overview', label: 'Overview', href: '/admin'},
  {id: 'workspaces', label: 'Workspaces', href: '/admin?view=workspaces'},
  {id: 'users', label: 'Users', href: '/admin?view=users'},
  {id: 'generations', label: 'Generation tasks', href: '/admin?view=generations'},
  {id: 'billing', label: 'Billing and credits', href: '/admin?view=billing'},
  {id: 'audit', label: 'Audit', href: '/admin?view=audit'},
  {id: 'affiliate-reviews', label: 'Affiliate reviews', href: '/admin?view=affiliate-reviews'},
  {id: 'affiliate-holds', label: 'Affiliate holds', href: '/admin?view=affiliate-holds'},
  {id: 'operations', label: 'Commands and recovery', href: '/admin?view=operations', roles: ['operator', 'superadmin']},
  {id: 'security-settings', label: 'Security settings', href: '/admin?view=security-settings', roles: ['superadmin']},
];
