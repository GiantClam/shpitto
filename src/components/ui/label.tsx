import type {LabelHTMLAttributes, ReactNode} from 'react';

export function Label({children, className = '', ...props}: LabelHTMLAttributes<HTMLLabelElement> & Readonly<{children: ReactNode}>) {
  return <label {...props} className={`ui-label ${className}`.trim()}>{children}</label>;
}

