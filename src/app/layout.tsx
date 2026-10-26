import type {CSSProperties, ReactNode} from 'react';
import type {Metadata, Viewport} from 'next';

import {AffiliateReferralCapture} from '../components/affiliates/referral-capture';
import {brand, brandCssVariables} from '../config/brand';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shpitto · AI video studio',
  description: 'Create videos from prompts or still images in your private creative workspace.',
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
    <html lang="en" data-scroll-behavior="smooth" style={brandCssVariables as CSSProperties}>
      <body><AffiliateReferralCapture />{children}</body>
    </html>
  );
}
