import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getServerLocale } from "@/lib/i18n-server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shpitto - AI Industrial Website Builder",
  description: "Generate professional industrial websites in seconds.",
  metadataBase: new URL("https://shpitto.com"),
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
