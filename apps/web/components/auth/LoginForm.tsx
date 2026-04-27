"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getLandingCopy, type Locale } from "@/lib/i18n";

export function LoginForm({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [nextPath, setNextPath] = useState("/chat");
  const router = useRouter();

  const supabase = createClient();
  const copy = getLandingCopy(locale).login;

  useEffect(() => {
    const nextParam = String(new URLSearchParams(window.location.search).get("next") || "/chat");
    const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/chat";
    setNextPath(safeNext);
  }, []);

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
    } else {
      router.push(nextPath);
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
        setLoading(false);
        return;
      }

      if (!data?.url) {
        setMessage({ type: "error", text: copy.oauthMissing });
        setLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch (error: any) {
      setMessage({ type: "error", text: String(error?.message || error || copy.oauthFailed) });
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: copy.emailConfirmation });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
        <div className="p-8">
          <div className="mb-8 flex items-center gap-2">
            <Link href="/" className="-ml-2 rounded-full p-2 transition-colors hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5 text-slate-500" />
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">S</div>
            <span className="text-xl font-bold text-slate-800">Shpitto</span>
            <div className="ml-auto">
              <LanguageSwitcher locale={locale} compact onLocaleChange={setLocale} />
            </div>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-slate-900">{copy.welcome}</h2>
          <p className="mb-8 text-slate-500">{copy.subtitle}</p>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {copy.google}
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-slate-500">{copy.divider}</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{copy.email}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{copy.password}</label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                placeholder={copy.passwordPlaceholder}
              />
            </div>

            {message ? (
              <div className={`rounded-lg p-3 text-sm ${message.type === "error" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                {message.text}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 font-bold text-white transition-all hover:bg-slate-800"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copy.signIn}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-slate-500">{copy.noAccount}</span>
            <button onClick={handleSignUp} disabled={loading} className="font-bold text-blue-600 hover:underline">
              {copy.signUp}
            </button>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-8 py-4 text-center text-xs text-slate-400">
          {copy.legal}
        </div>
      </div>
    </div>
  );
}
