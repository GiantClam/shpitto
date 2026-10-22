import type {HTMLAttributes, ReactNode} from 'react';

export function Card({children, className = '', ...props}: HTMLAttributes<HTMLElement> & Readonly<{children: ReactNode}>) {
  return <section {...props} className={`ui-card ${className}`.trim()}>{children}</section>;
}

export function CardHeader({children, className = '', ...props}: HTMLAttributes<HTMLDivElement> & Readonly<{children: ReactNode}>) {
  return <div {...props} className={`ui-card-header ${className}`.trim()}>{children}</div>;
}

export function CardContent({children, className = '', ...props}: HTMLAttributes<HTMLDivElement> & Readonly<{children: ReactNode}>) {
  return <div {...props} className={`ui-card-content ${className}`.trim()}>{children}</div>;
}

