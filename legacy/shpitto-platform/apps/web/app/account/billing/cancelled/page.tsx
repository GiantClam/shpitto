import Link from "next/link";

export default function BillingCancelledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fffaf5,#f1e8df)] px-6 py-12 text-[var(--shp-text)]">
      <section className="w-full max-w-xl rounded-[2rem] border border-[var(--shp-border)] bg-white/85 p-8 text-center shadow-[var(--shp-shadow)]">
        <h1 className="text-3xl font-black">PayPal checkout cancelled</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--shp-muted)]">
          No entitlement was issued and no billing ledger entry was created. You can restart checkout at any time.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/account/billing" className="rounded-full bg-[var(--shp-primary)] px-6 py-3 font-black text-white">
            Restart checkout
          </Link>
          <Link href="/pricing" className="rounded-full border border-[var(--shp-border)] bg-white px-6 py-3 font-black">
            View pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
