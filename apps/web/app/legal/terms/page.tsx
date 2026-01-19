import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center gap-4">
          <Link href="/" className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </Link>
          <span className="font-bold text-xl tracking-tight">Terms of Service</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: January 18, 2026</p>
          
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing our website at https://shipitto.com, you agree to be bound by these terms of service, all applicable laws and regulations, 
            and agree that you are responsible for compliance with any applicable local laws.
          </p>

          <h2>2. Use License</h2>
          <p>
            Permission is granted to temporarily download one copy of the materials (information or software) on Shipitto's website for personal, 
            non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.
          </p>

          <h2>3. Generated Content Ownership</h2>
          <p>
            You retain ownership of the content you generate using Shipitto. 
            However, Shipitto retains ownership of the underlying AI models, templates, and software infrastructure used to generate that content.
          </p>

          <h2>4. Disclaimer</h2>
          <p>
            The materials on Shipitto's website are provided on an 'as is' basis. Shipitto makes no warranties, expressed or implied, 
            and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, 
            fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
          </p>

          <h2>5. Governing Law</h2>
          <p>
            These terms and conditions are governed by and construed in accordance with the laws of Delaware and you irrevocably submit to the exclusive jurisdiction of the courts in that State.
          </p>
        </div>
      </main>
    </div>
  );
}
