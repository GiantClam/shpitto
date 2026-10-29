import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AcceptableUsePolicyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-3xl items-center gap-4 px-6">
          <Link href="/" className="-ml-2 rounded-full p-2 transition-colors hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <span className="text-xl font-bold tracking-tight">Acceptable Use Policy</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 text-4xl font-bold">Acceptable Use Policy</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: May 18, 2026</p>

          <p>
            This Acceptable Use Policy explains how you may and may not use Shpitto. It applies to all use of the
            platform, including website generation, AI-assisted content creation, asset uploads, contact forms, and
            project collaboration features.
          </p>
          <p>
            This policy is part of the Terms of Service and is intended to protect users, partners, payment providers,
            and the integrity of the platform.
          </p>
          <p>
            Shpitto is operated by huangbei as an independent developer.
          </p>

          <h2>1. Permitted use</h2>
          <p>
            You may use Shpitto to create, refine, publish, and manage lawful websites and related digital content for
            legitimate business or personal projects.
          </p>

          <h2>2. Prohibited content and activity</h2>
          <p>You may not use Shpitto to create, upload, request, publish, distribute, or facilitate content or activity that:</p>
          <ul>
            <li>Violates any applicable law or regulation.</li>
            <li>Infringes another party&apos;s intellectual property, privacy, publicity, or other rights.</li>
            <li>Contains fraud, deceptive claims, impersonation, phishing, scams, or malicious code.</li>
            <li>Promotes violence, terrorism, exploitation, harassment, hate, or abuse.</li>
            <li>Contains sexually explicit, pornographic, NSFW, or sexually suggestive generated content.</li>
            <li>Markets the service as uncensored, unfiltered, or intended to bypass content restrictions.</li>
            <li>Attempts to interfere with the platform, other users, or third-party systems.</li>
          </ul>

          <h2>3. AI generation restrictions</h2>
          <p>
            Shpitto provides AI-assisted website and content generation. You may not use the platform to request or
            generate explicit sexual content, pornographic content, or other prohibited material. You are responsible
            for the prompts, files, text, and assets you submit, and for the content you publish using generated output.
          </p>

          <h2>4. User content responsibility</h2>
          <p>
            You are responsible for ensuring that your inputs and outputs are accurate, lawful, and suitable for your
            intended use. You must review generated content before publishing it live.
          </p>

          <h2>5. Enforcement</h2>
          <p>
            We may monitor, review, remove, block, or restrict content or accounts that violate this policy. We may
            suspend or terminate access immediately where necessary to protect users, partners, payment providers, or
            the platform.
          </p>

          <h2>6. Reporting concerns</h2>
          <p>
            If you believe content or conduct on Shpitto violates this policy, contact us at{" "}
            <a href="mailto:support@shpitto.com">support@shpitto.com</a>.
          </p>

          <h2>7. Changes to this policy</h2>
          <p>
            We may update this Acceptable Use Policy from time to time. When we do, we will revise the &quot;Last updated&quot;
            date on this page. Continued use of Shpitto after the updated policy takes effect constitutes acceptance of
            the revised policy.
          </p>
        </div>
      </main>
    </div>
  );
}
