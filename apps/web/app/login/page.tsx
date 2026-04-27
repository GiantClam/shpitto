import { LoginForm } from "@/components/auth/LoginForm";
import { getServerLocale } from "@/lib/i18n-server";

export default async function LoginPage() {
  const locale = await getServerLocale();
  return <LoginForm initialLocale={locale} />;
}
