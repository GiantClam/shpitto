import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getServerLocale } from "@/lib/i18n-server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const params = (await searchParams) || {};
  const token = String(Array.isArray(params.token) ? params.token[0] || "" : params.token || "");

  return <ResetPasswordForm initialLocale={locale} token={token} />;
}
