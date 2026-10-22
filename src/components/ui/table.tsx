import type {HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes} from 'react';

export function Table({children, className = '', ...props}: HTMLAttributes<HTMLTableElement> & Readonly<{children: ReactNode}>) {
  return <table {...props} className={`ui-table ${className}`.trim()}>{children}</table>;
}

export function TableHead({children, className = '', ...props}: HTMLAttributes<HTMLTableSectionElement> & Readonly<{children: ReactNode}>) {
  return <thead {...props} className={`ui-table-head ${className}`.trim()}>{children}</thead>;
}

export function TableBody({children, className = '', ...props}: HTMLAttributes<HTMLTableSectionElement> & Readonly<{children: ReactNode}>) {
  return <tbody {...props} className={`ui-table-body ${className}`.trim()}>{children}</tbody>;
}

export function TableRow({children, className = '', ...props}: HTMLAttributes<HTMLTableRowElement> & Readonly<{children: ReactNode}>) {
  return <tr {...props} className={`ui-table-row ${className}`.trim()}>{children}</tr>;
}

export function TableHeader({children, className = '', ...props}: ThHTMLAttributes<HTMLTableCellElement> & Readonly<{children: ReactNode}>) {
  return <th {...props} className={`ui-table-header ${className}`.trim()}>{children}</th>;
}

export function TableCell({children, className = '', ...props}: TdHTMLAttributes<HTMLTableCellElement> & Readonly<{children: ReactNode}>) {
  return <td {...props} className={`ui-table-cell ${className}`.trim()}>{children}</td>;
}

