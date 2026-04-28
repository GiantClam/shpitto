import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { getServerLocale } from "@/lib/i18n-server";

export default async function AccountPasswordPage() {
  const locale = await getServerLocale();
  return <ChangePasswordForm initialLocale={locale} />;
}
