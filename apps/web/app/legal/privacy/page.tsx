import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-3xl items-center gap-4 px-6">
          <Link href="/" className="-ml-2 rounded-full p-2 transition-colors hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <span className="text-xl font-bold tracking-tight">Privacy Policy</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 text-4xl font-bold">Privacy Policy</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: May 18, 2026</p>

          <p>
            This Privacy Policy applies to Shpitto, including shpitto.com, related product pages, account areas,
            hosted application surfaces, and associated support flows. It describes how Shpitto collects, uses, stores,
            and shares information when you visit our website, create an account, use our AI website generation
            platform, submit forms, or otherwise interact with our services.
          </p>
          <p>
            Shpitto is operated by huangbei as an independent developer.
          </p>

          <h2>1. Information we collect</h2>
          <p>We may collect the following categories of information:</p>
          <ul>
            <li>Account information, such as name, email address, company name, and authentication details.</li>
            <li>Project and content information, such as prompts, uploaded files, generated pages, blog content, and related assets.</li>
            <li>Usage and device data, such as browser type, IP address, approximate location, analytics events, and feature interactions.</li>
            <li>Contact and lead information, such as form submissions, inquiry details, and related follow-up records.</li>
            <li>Billing and subscription information, such as plan selections and payment status. Payment processing is handled by our payment partners and we do not store full card numbers.</li>
          </ul>

          <h2>2. How we use information</h2>
          <p>We use collected information to:</p>
          <ul>
            <li>Provide, operate, secure, and improve the Shpitto platform.</li>
            <li>Create, refine, deploy, and host generated website experiences and related assets.</li>
            <li>Authenticate users, manage accounts, and support password reset or verification flows.</li>
            <li>Process inquiries, send service messages, and respond to support requests.</li>
            <li>Measure product usage, prevent abuse, detect fraud, and enforce our policies.</li>
            <li>Support billing, subscriptions, renewals, and account management.</li>
          </ul>

          <h2>3. AI processing</h2>
          <p>
            Shpitto uses AI-assisted systems to help generate website structure, copy, and related content. Information
            you submit to the platform, including prompts, uploaded material, and project content, may be processed for
            generation, refinement, moderation, safety review, and service improvement. You should not submit sensitive
            personal data or regulated data unless you are authorized to do so and it is necessary for your use case.
          </p>

          <h2>4. Sharing of information</h2>
          <p>We may share information with service providers and infrastructure partners that help us operate the platform, such as hosting, authentication, analytics, payment, storage, email, and AI processing providers. We may also disclose information when required by law, to protect our rights, or to prevent fraud, abuse, or security issues.</p>

          <h2>5. Data retention</h2>
          <p>
            We retain information for as long as needed to provide the service, comply with legal obligations, resolve
            disputes, enforce agreements, and maintain reasonable business records. Retention periods may vary depending
            on the type of data and your account status.
          </p>

          <h2>6. Your choices</h2>
          <p>
            You may update account information, manage project content, or request support by contacting us. Depending
            on your jurisdiction, you may also have rights to request access, correction, deletion, or restriction of
            certain personal data, subject to applicable law and our legal obligations.
          </p>

          <h2>7. Security</h2>
          <p>
            We use reasonable administrative, technical, and organizational measures to protect data. No method of
            storage or transmission is completely secure, and we cannot guarantee absolute security.
          </p>

          <h2>8. International processing</h2>
          <p>
            Your information may be processed in jurisdictions other than your own, depending on where our providers
            and infrastructure operate.
          </p>

          <h2>9. Changes to this Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in the service, legal requirements,
            or operational practices. When we do, we will update the &quot;Last updated&quot; date on this page. Material changes
            will take effect when posted unless a different effective date is stated.
          </p>

          <h2>10. Contact</h2>
          <p>
            If you have questions about this Privacy Policy or want to make a privacy-related request, contact us at{" "}
            <a href="mailto:support@shpitto.com">support@shpitto.com</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
