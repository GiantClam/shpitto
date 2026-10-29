import type {HTMLAttributes, ReactNode} from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export function Badge({children, variant = 'neutral', className = '', ...props}: HTMLAttributes<HTMLSpanElement> & Readonly<{children: ReactNode; variant?: BadgeVariant}>) {
  return <span {...props} className={`ui-badge ui-badge-${variant} ${className}`.trim()}>{children}</span>;
}

