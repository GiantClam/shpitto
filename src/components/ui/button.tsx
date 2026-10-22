import type {ButtonHTMLAttributes} from 'react';

export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'danger';

export function Button({variant = 'default', className = '', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & Readonly<{variant?: ButtonVariant}>) {
  return <button {...props} className={`ui-button ui-button-${variant} ${className}`.trim()} />;
}

