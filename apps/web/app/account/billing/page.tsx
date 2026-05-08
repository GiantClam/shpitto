import Link from "next/link";
import { BillingCheckoutPanel } from "./BillingCheckoutPanel";
import { PAID_BILLING_DISABLED_MESSAGE, isPaidBillingEnabled } from "@/lib/billing/config";
import { canCreateProject, isWithinRetentionPeriod } from "@/lib/billing/entitlements";
import { getBillingPlan, isBillingPlanCode, type BillingPlanCode } from "@/lib/billing/plans";
import {
  countCreatedProjects,
  grantFreeTrialIfMissing,
  isBillingStorageConfigured,
  seedBillingPlans,
} from "@/lib/billing/store";
import { getOptionalServerUser } from "@/lib/supabase/optional-user";

type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePlan(value: string | undefined): BillingPlanCode {
  if (!isPaidBillingEnabled()) return "free";
  const planCode = String(value || "").trim().toLowerCase();
  return isBillingPlanCode(planCode) && planCode !== "free" ? planCode : "starter";
}

function normalizeMonths(value: string | undefined, planCode: BillingPlanCode) {
  if (planCode === "experience") return 12;
  const months = Number(value || 12);
  return [12, 24, 36, 48].includes(months) ? months : 12;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = (await searchParams) || {};
  const selectedPlanCode = normalizePlan(firstParam(params.plan));
  const selectedMonths = normalizeMonths(firstParam(params.months), selectedPlanCode);
  const selectedPlan = getBillingPlan(selectedPlanCode);
  const billingEnabled = isPaidBillingEnabled();
  const user = await getOptionalServerUser();
  const userId = String(user?.id || "").trim();

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--shp-bg)] px-6">
        <section className="max-w-lg rounded-[2rem] border border-[var(--shp-border)] bg-white p-8 text-center shadow-[var(--shp-shadow)]">
          <h1 className="text-3xl font-black">Sign in to view billing</h1>
          <p className="mt-4 text-[var(--shp-muted)]">
            Billing, website quota, PayPal orders, and upgrade options are available after sign-in.
          </p>
          <Link href="/login" className="mt-8 inline-flex rounded-full bg-[var(--shp-primary)] px-6 py-3 font-black text-white">
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  const storageConfigured = isBillingStorageConfigured();
  let entitlement = undefined as Awaited<ReturnType<typeof grantFreeTrialIfMissing>>;
  let usedSites = 0;
  if (storageConfigured) {
    await seedBillingPlans();
    entitlement = await grantFreeTrialIfMissing(userId);
    usedSites = await countCreatedProjects(userId);
  }
  const quota = canCreateProject(entitlement, usedSites);
  const retention = entitlement ? isWithinRetentionPeriod(entitlement) : false;
  const percent = entitlement ? Math.min(100, Math.round((usedSites / Math.max(1, entitlement.siteLimit)) * 100)) : 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fffaf5,#f1e8df)] px-6 py-12 text-[var(--shp-text)]">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--shp-hot)]">Billing</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Plan and website quota</h1>
          </div>
          <Link href="/pricing" className="rounded-full border border-[var(--shp-border)] bg-white px-5 py-3 text-sm font-black">
            View all plans
          </Link>
        </div>

        {!storageConfigured ? (
          <section className="mt-10 rounded-[2rem] border border-amber-300 bg-amber-50 p-6 text-amber-900">
            Billing storage is not configured. Configure Supabase service-role access before PayPal checkout can persist sessions,
            entitlements, and ledger entries.
          </section>
        ) : null}

        <section className="mt-10 grid gap-6 md:grid-cols-[1.35fr_1fr]">
          <div className="rounded-[2rem] border border-[var(--shp-border)] bg-white/80 p-7 shadow-[var(--shp-shadow-soft)]">
            {!billingEnabled ? (
              <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                {PAID_BILLING_DISABLED_MESSAGE}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--shp-muted)]">Current plan</p>
                <h2 className="mt-1 text-3xl font-black">{entitlement?.planCode || "missing"}</h2>
              </div>
              <span className="rounded-full bg-[color-mix(in_oklab,var(--shp-primary)_12%,white)] px-4 py-2 text-sm font-bold text-[var(--shp-hot)]">
                {entitlement?.status || "missing"}
              </span>
            </div>

            <div className="mt-8">
              <div className="flex justify-between text-sm font-bold">
                <span>Website quota used</span>
                <span>{usedSites}/{entitlement?.siteLimit || 0}</span>
              </div>
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-[var(--shp-surface-alt)]">
                <div className="h-full rounded-full bg-[var(--shp-primary)]" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-3 text-sm text-[var(--shp-muted)]">
                A project starts consuming quota when it is created. Draft, published, archived, deleted, and retained
                projects continue to count until system cleanup completes.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[var(--shp-border)] bg-white/70 p-5">
              <p className="text-sm text-[var(--shp-muted)]">Expires at</p>
              <div className="mt-2 text-2xl font-black">
                {entitlement?.validUntil ? entitlement.validUntil.toLocaleDateString("zh-CN") : "-"}
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--shp-muted)]">
                {retention
                  ? "This account is in the 60-day retention window. New publishing, deployments, and custom domains are blocked."
                  : quota.allowed
                    ? "This account can create and publish within the current quota."
                    : "This account cannot create a new website until it renews, upgrades, or cleanup releases quota."}
              </p>
            </div>
          </div>

          <BillingCheckoutPanel
            initialPlanCode={selectedPlan?.code || "starter"}
            initialMonths={selectedMonths}
            billingEnabled={billingEnabled}
          />
        </section>
      </div>
    </main>
  );
}
