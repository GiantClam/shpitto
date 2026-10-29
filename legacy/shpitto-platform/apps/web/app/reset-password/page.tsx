import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { safeAuthNextPath } from "@/lib/auth/next-path";
import { safeAuthTheme } from "@/lib/auth/theme";
import { getServerLocale } from "@/lib/i18n-server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const params = (await searchParams) || {};
  const token = String(Array.isArray(params.token) ? params.token[0] || "" : params.token || "");
  const nextPath = safeAuthNextPath(params.next);
  const theme = safeAuthTheme(params.theme);
  const projectId = String(Array.isArray(params.projectId) ? params.projectId[0] || "" : params.projectId || "").trim();
  const siteKey = String(Array.isArray(params.siteKey) ? params.siteKey[0] || "" : params.siteKey || "").trim();

  return (
    <ResetPasswordForm
      initialLocale={locale}
      token={token}
      nextPath={nextPath}
      theme={theme}
      projectId={projectId || undefined}
      siteKey={siteKey || undefined}
    />
  );
}
