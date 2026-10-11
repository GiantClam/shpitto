import type {CSSProperties, ReactNode} from 'react';
import type {Metadata, Viewport} from 'next';

import {brand, brandCssVariables} from '../config/brand';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shpitto · Governed website templates',
  description: 'Shpitto templates with owned code and reusable workflows.',
  metadataBase: new URL('https://shpitto.com'),
  icons: {
    icon: '/brand/shpitto-icon.png',
    apple: '/brand/shpitto-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: brand.tokens.colors.canvas,
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en" style={brandCssVariables as CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
