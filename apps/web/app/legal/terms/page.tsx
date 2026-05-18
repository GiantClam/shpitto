import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-3xl items-center gap-4 px-6">
          <Link href="/" className="-ml-2 rounded-full p-2 transition-colors hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <span className="text-xl font-bold tracking-tight">Terms of Service</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 text-4xl font-bold">Terms of Service</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: May 18, 2026</p>

          <p>
            These Terms of Service govern your access to and use of Shpitto, including our website, AI website
            generation tools, deployment workflows, blog and asset features, contact form workflows, and related
            services.
          </p>
          <p>
            These Terms form a binding agreement between you and huangbei, the independent developer operating
            Shpitto.
          </p>

          <h2>1. Acceptance of terms</h2>
          <p>
            By accessing or using Shpitto, you agree to these Terms of Service, our Privacy Policy, and our Acceptable
            Use Policy. If you do not agree, do not use the service.
          </p>

          <h2>2. Eligibility and accounts</h2>
          <p>
            You must be legally able to enter into a binding agreement to use the service. You are responsible for
            maintaining the security of your account and for all activity under it.
          </p>

          <h2>3. Service description</h2>
          <p>
            Shpitto is a software-as-a-service platform that helps users generate, refine, manage, and deploy websites
            and related digital content. Features may change over time and some functionality may depend on plan level,
            infrastructure, third-party providers, or product availability.
          </p>

          <h2>4. Billing, service periods, and cancellation</h2>
          <p>
            Shpitto may offer free trials, prepaid plans, annual passes, usage-limited entitlements, and other paid
            access options. Pricing, included website quota, covered service period, and whether a plan is one-time or
            recurring will be shown in the product UI or checkout flow before purchase.
          </p>
          <p>
            At the time of this policy update, Shpitto&apos;s paid plans are primarily sold as prepaid service periods.
            By completing checkout, you authorize the listed one-time or recurring charges, as applicable, through our
            payment processors or merchant-of-record partners. You are responsible for keeping your payment method and
            billing information accurate and up to date.
          </p>
          <p>
            You may stop using the service at any time. If Shpitto later offers recurring renewals, you may cancel
            future renewal charges through the billing tools we provide or by contacting support before the next billing
            cycle begins. Cancelling does not retroactively refund already-paid service periods unless required by law
            or expressly approved by Shpitto.
          </p>

          <h2>5. Refunds</h2>
          <p>
            Because Shpitto is a digital software service and paid access may unlock immediate platform use, generated
            output, project capacity, or other non-recoverable service value, fees are generally non-refundable after
            purchase.
          </p>
          <p>
            Notwithstanding the above, we may review requests related to duplicate charges, clear billing errors,
            unauthorized transactions, or other situations where a refund is required by law. Refund requests should be
            sent to <a href="mailto:support@shpitto.com">support@shpitto.com</a>.
          </p>

          <h2>6. User content and generated output</h2>
          <p>
            You retain rights in content and materials you submit to Shpitto, subject to any rights needed for us to
            operate the service. As between you and Shpitto, you may use generated website output for your own lawful
            projects, but Shpitto retains all rights in the software, models, templates, product design, and underlying
            platform.
          </p>
          <p>
            You are responsible for reviewing generated output before publishing or relying on it. You must ensure your
            content and use of output do not violate law, third-party rights, or our policies.
          </p>

          <h2>7. Acceptable use</h2>
          <p>
            You may not use Shpitto for unlawful, abusive, infringing, fraudulent, or harmful activity. You may not use
            the service to generate or distribute sexually explicit, pornographic, NSFW, or sexually suggestive content,
            or to market the service as uncensored or designed to evade content restrictions. See our{" "}
            <Link href="/legal/acceptable-use">Acceptable Use Policy</Link> for more detail.
          </p>

          <h2>8. Third-party services</h2>
          <p>
            Shpitto relies on third-party services for hosting, storage, analytics, authentication, payment processing,
            AI processing, email delivery, and related infrastructure. We are not responsible for outages, changes, or
            failures caused by third-party providers.
          </p>

          <h2>9. Service availability</h2>
          <p>
            We may modify, suspend, or discontinue part of the service at any time. We do not guarantee uninterrupted
            availability, error-free operation, or that generated output will always be complete, accurate, or suitable
            for your purpose.
          </p>

          <h2>10. Termination</h2>
          <p>
            We may suspend or terminate your access if you violate these Terms, our Acceptable Use Policy, or applicable
            law, or if your use creates risk for the service, other users, partners, or payment providers.
          </p>

          <h2>11. Disclaimer and limitation of liability</h2>
          <p>
            The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law,
            Shpitto disclaims warranties of merchantability, fitness for a particular purpose, non-infringement, and
            uninterrupted availability.
          </p>
          <p>
            To the maximum extent permitted by law, Shpitto will not be liable for indirect, incidental, special,
            consequential, exemplary, or punitive damages, or for lost profits, lost revenue, lost data, or business
            interruption arising from your use of the service.
          </p>

          <h2>12. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time to reflect changes in the product, pricing model, legal
            requirements, or operational practices. When we do, we will update the &quot;Last updated&quot; date on this page.
            Continued use of Shpitto after updated Terms take effect constitutes acceptance of the revised Terms.
          </p>

          <h2>13. Governing law</h2>
          <p>
            These Terms are governed by the laws applicable in the jurisdiction where huangbei is established, without
            regard to conflict of law principles, unless mandatory law requires otherwise.
          </p>

          <h2>14. Contact</h2>
          <p>
            If you have questions about these Terms, contact us at{" "}
            <a href="mailto:support@shpitto.com">support@shpitto.com</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
