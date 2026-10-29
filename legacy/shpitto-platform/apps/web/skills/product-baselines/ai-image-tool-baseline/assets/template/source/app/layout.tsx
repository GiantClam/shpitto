import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../components/auth/auth-provider";
import { SiteHeader } from "../components/shell/site-header";
import { SiteFooter } from "../components/shell/site-footer";
import { getCurrentLocale, getDictionary } from "../lib/i18n";

export const metadata: Metadata = {
  title: "AI Image Studio | AI image generation",
  description: "Commercial AI image generation template derived from the fluxkreafree product workflow.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getCurrentLocale();
  const dictionary = await getDictionary(locale);
  const bodyClassName = ["min-h-screen bg-background font-sans antialiased", "font-sans"].filter(Boolean).join(" ");
  return (
    <html lang={locale}>
      <body className={bodyClassName}>
        <AuthProvider>
          <div className="site-frame">
            <SiteHeader dictionary={dictionary} />
            {children}
            <SiteFooter dictionary={dictionary} />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
