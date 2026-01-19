import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center gap-4">
          <Link href="/" className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </Link>
          <span className="font-bold text-xl tracking-tight">Privacy Policy</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: January 18, 2026</p>
          
          <p>
            At Shipitto, accessible from https://shipitto.com, one of our main priorities is the privacy of our visitors. 
            This Privacy Policy document contains types of information that is collected and recorded by Shipitto and how we use it.
          </p>

          <h2>1. Information We Collect</h2>
          <p>
            The personal information that you are asked to provide, and the reasons why you are asked to provide it, 
            will be made clear to you at the point we ask you to provide your personal information.
          </p>
          <ul>
            <li>Account information (Name, Email, Company Name)</li>
            <li>Usage data (How you interact with our AI builder)</li>
            <li>Generated content data (The websites you build)</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect in various ways, including to:</p>
          <ul>
            <li>Provide, operate, and maintain our website</li>
            <li>Improve, personalize, and expand our website</li>
            <li>Understand and analyze how you use our website</li>
            <li>Develop new products, services, features, and functionality</li>
          </ul>

          <h2>3. AI Processing</h2>
          <p>
            Shipitto uses advanced Artificial Intelligence to generate website content. 
            Data you input into the builder (prompts, company descriptions) is processed by our AI models to generate results.
            We do not use your private proprietary data to train our public models without explicit consent.
          </p>

          <h2>4. Contact Us</h2>
          <p>
            If you have additional questions or require more information about our Privacy Policy, do not hesitate to contact us at support@shipitto.com.
          </p>
        </div>
      </main>
    </div>
  );
}
