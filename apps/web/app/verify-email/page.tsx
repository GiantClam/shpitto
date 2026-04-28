import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";
import { getServerLocale } from "@/lib/i18n-server";

function safeNextPath(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/chat";
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const params = (await searchParams) || {};
  const email = String(Array.isArray(params.email) ? params.email[0] || "" : params.email || "");
  const token = String(Array.isArray(params.token) ? params.token[0] || "" : params.token || "");

  return <VerifyEmailForm initialLocale={locale} email={email} nextPath={safeNextPath(params.next)} token={token} />;
}
