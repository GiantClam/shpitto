import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { GoogleTagManagerBody, GoogleTagManagerHead } from "@/components/analytics/GoogleTagManager";
import { getServerLocale } from "@/lib/i18n-server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shpitto - AI Industrial Website Builder",
  description: "Generate professional industrial websites in minutes.",
  metadataBase: new URL("https://shpitto.com"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "512x512" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f3ee",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <head>
        <GoogleTagManagerHead />
      </head>
      <body className={inter.className}>
        <GoogleTagManagerBody />
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
