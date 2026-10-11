export type NavigationItem = Readonly<{
  label: string;
  href: string;
  status?: 'preview' | 'planned';
}>;

export const marketingNavigation: readonly NavigationItem[] = [
  {label: 'Home', href: '/'},
  {label: 'Docs', href: '/docs', status: 'preview'},
  {label: 'Dashboard', href: '/dashboard'},
];

export const adminNavigation: readonly NavigationItem[] = [
  {label: 'Overview', href: '/admin'},
  {label: 'Users', href: '/admin?view=users'},
  {label: 'Generations', href: '/admin?view=generations'},
  {label: 'Billing', href: '/admin?view=billing'},
  {label: 'Audit', href: '/admin?view=audit'},
];
