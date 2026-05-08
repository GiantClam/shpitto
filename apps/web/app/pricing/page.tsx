import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import { getBillingPlans } from "@/lib/billing/plans";
import { calculatePlanPrice } from "@/lib/billing/pricing";
import { getServerLocale } from "@/lib/i18n-server";
import { getOptionalServerUser } from "@/lib/supabase/optional-user";

function money(minor: number) {
  return `CNY ${(minor / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function PricingPage() {
  const locale = await getServerLocale();
  const user = await getOptionalServerUser();
  const userEmail = String(user?.email || "").trim();
  const plans = getBillingPlans();
  const paidBillingEnabled = isPaidBillingEnabled();

  return (
    <main className="min-h-screen bg-[radial-gradient(900px_420px_at_18%_0%,rgba(252,89,83,0.16),transparent_70%),linear-gradient(180deg,#fffaf5,#f1e8df)] text-[var(--shp-text)]">
      <SiteHeader userEmail={userEmail} getStartedHref="/launch-center" locale={locale} />

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-20">
        <div className="mx-auto max-w-4xl text-center">
          {!paidBillingEnabled ? (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 shadow-sm">
              {PAID_BILLING_DISABLED_MESSAGE}
            </div>
          ) : null}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_30%,transparent)] bg-white/60 px-4 py-2 text-sm font-bold text-[var(--shp-hot)] shadow-sm">
            <Sparkles className="h-4 w-4" />
            Prepay 12 months or more and get 30% off for the full service period
          </div>
          <h1 className="text-balance text-5xl font-black tracking-tight lg:text-7xl">
            Buy Shpitto capacity by active website quota
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[var(--shp-muted)]">
            Plans show the discounted equivalent monthly price. Checkout clearly shows the actual prepaid amount,
            covered months, and website quota before PayPal approval.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-5">
          {plans.map((plan) => {
            const price = plan.code === "free" ? calculatePlanPrice("free", 0) : calculatePlanPrice(plan.code, 12);
            const originalMonthly = plan.baseMonthlyPriceMinor;
            const displayMonthly = price.displayMonthlyPriceMinor;
            const ctaHref =
              plan.code === "free"
                ? "/launch-center"
                : paidBillingEnabled
                  ? `/account/billing?plan=${plan.code}&months=12`
                  : undefined;
            return (
              <article
                key={plan.code}
                className={`relative flex min-h-[470px] flex-col rounded-[2rem] border p-6 shadow-[0_24px_70px_rgba(66,39,28,0.10)] ${
                  plan.highlighted
                    ? "border-[var(--shp-primary)] bg-[linear-gradient(160deg,#fff,#fff0ed)]"
                    : "border-[color-mix(in_oklab,var(--shp-border)_78%,transparent)] bg-white/75"
                }`}
              >
                {plan.highlighted ? (
                  <div className="absolute right-5 top-5 rounded-full bg-[var(--shp-primary)] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
                    Popular
                  </div>
                ) : null}

                <div className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-muted)]">{plan.name}</div>
                <h2 className="mt-3 text-2xl font-black">{plan.tagline}</h2>

                <div className="mt-7">
                  {plan.code !== "free" && originalMonthly > 0 ? (
                    <div className="text-sm text-[var(--shp-muted)]">
                      List price <span className="line-through">{money(originalMonthly)}/mo</span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex items-end gap-1">
                    <span className="text-4xl font-black">{money(displayMonthly)}</span>
                    <span className="pb-1 text-sm text-[var(--shp-muted)]">/mo</span>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-[var(--shp-hot)]">
                    {plan.code === "free"
                      ? "Free for 7 days"
                      : plan.code === "experience"
                        ? `One annual payment: ${money(price.payableAmountMinor)}`
                        : `12-month prepaid total: ${money(price.payableAmountMinor)}`}
                  </div>
                </div>

                <ul className="mt-8 space-y-4 text-sm leading-6 text-[var(--shp-muted)]">
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />
                    Up to {plan.siteLimit} counted website{plan.siteLimit === 1 ? "" : "s"}
                  </li>
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />
                    Quota is counted when a project is created
                  </li>
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />
                    60-day retention after expiry, including free users
                  </li>
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--shp-primary)]" />
                    Upgrade by paying the remaining-period difference
                  </li>
                </ul>

                {ctaHref ? (
                  <Link
                    href={ctaHref}
                    className={`mt-auto inline-flex justify-center rounded-full px-5 py-3 text-sm font-black uppercase tracking-[0.14em] ${
                      plan.highlighted
                        ? "bg-[var(--shp-primary)] text-white shadow-[0_18px_36px_rgba(252,89,83,0.25)]"
                        : "border border-[var(--shp-border)] bg-white text-[var(--shp-text)]"
                    }`}
                  >
                    {plan.code === "free" ? "Start Trial" : "Choose Plan"}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={`mt-auto inline-flex justify-center rounded-full px-5 py-3 text-sm font-black uppercase tracking-[0.14em] opacity-60 ${
                      plan.highlighted
                        ? "bg-[var(--shp-primary)] text-white shadow-[0_18px_36px_rgba(252,89,83,0.25)]"
                        : "border border-[var(--shp-border)] bg-white text-[var(--shp-text)]"
                    }`}
                  >
                    Temporarily unavailable
                  </span>
                )}
              </article>
            );
          })}
        </div>

        <section className="mt-10 rounded-[2rem] border border-[color-mix(in_oklab,var(--shp-border)_80%,transparent)] bg-white/70 p-7 text-sm leading-7 text-[var(--shp-muted)]">
          <p className="font-bold text-[var(--shp-text)]">Billing note</p>
          <p className="mt-2">
            Paid plans are prepaid. The monthly price is the equivalent discounted monthly cost; PayPal collects the
            selected plan total for the selected prepaid duration. Prepaying 12 months or more applies the 30% discount
            and locks that price until the service period ends.
          </p>
          {!paidBillingEnabled ? (
            <p className="mt-2 text-amber-900">
              Paid checkout and upgrades are temporarily disabled. The paid plans remain visible for reference only.
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
}
