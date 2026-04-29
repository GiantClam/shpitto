import { RegisterForm } from "@/components/auth/RegisterForm";
import { getServerLocale } from "@/lib/i18n-server";

function safeNextPath(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/launch-center";
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const params = (await searchParams) || {};

  return <RegisterForm initialLocale={locale} nextPath={safeNextPath(params.next)} />;
}
