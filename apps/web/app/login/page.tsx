import { LoginForm } from "@/components/auth/LoginForm";
import { getServerLocale } from "@/lib/i18n-server";
import { safeAuthNextPath } from "@/lib/auth/next-path";
import { safeAuthTheme } from "@/lib/auth/theme";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const params = (await searchParams) || {};
  const projectId = String(Array.isArray(params.projectId) ? params.projectId[0] || "" : params.projectId || "").trim();
  const siteKey = String(Array.isArray(params.siteKey) ? params.siteKey[0] || "" : params.siteKey || "").trim();
  return (
    <LoginForm
      initialLocale={locale}
      nextPath={safeAuthNextPath(params.next)}
      theme={safeAuthTheme(params.theme)}
      projectId={projectId || undefined}
      siteKey={siteKey || undefined}
    />
  );
}
