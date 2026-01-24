import Link from "next/link";
import { Zap } from "lucide-react";
import { Hero } from "@/components/landing/Hero";
import { EfficiencySection } from "@/components/landing/EfficiencySection";
import { VisualQualitySection } from "@/components/landing/VisualQualitySection";
import { BlogSection } from "@/components/landing/BlogSection";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white font-sans selection:bg-blue-500/30">
      {/* Navigation */}
      <header className="fixed top-0 w-full bg-[#0A0F1C]/80 backdrop-blur-md z-50 border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-[0_0_15px_rgba(37,99,235,0.5)]">S</div>
            <span className="font-bold text-xl tracking-tight text-white">Shpitto</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#showcase" className="hover:text-white transition-colors">Showcase</Link>
            <Link href="#blog" className="hover:text-white transition-colors">Blog</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-bold text-slate-400 hover:text-white transition-colors hidden sm:block">Log in</Link>
            <Link href="/login" className="px-6 py-2.5 bg-white text-slate-900 text-sm font-bold rounded-full hover:bg-slate-200 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Hero />
        <EfficiencySection />
        <VisualQualitySection />
        <BlogSection />
        
        {/* Final CTA */}
        <section className="py-32 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-600"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-transparent to-transparent"></div>
            
            <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                <h2 className="text-4xl lg:text-6xl font-bold mb-8 tracking-tight text-white">Ready to Build Smart?</h2>
                <p className="text-xl text-blue-100/80 mb-12 max-w-2xl mx-auto">
                    Join thousands of industrial leaders who are growing fast with Shpitto. No credit card required.
                </p>
                <Link href="/login" className="inline-flex items-center gap-2 px-10 py-5 bg-white text-blue-600 font-bold rounded-full text-lg shadow-2xl hover:scale-105 transition-transform">
                    <Zap className="w-5 h-5 fill-current" />
                    Start Your Project Now
                </Link>
            </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-16 bg-slate-900 text-slate-400 text-sm border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1">
                <div className="flex items-center gap-2 text-white mb-6">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg">S</div>
                    <span className="font-bold text-xl">Shpitto</span>
                </div>
                <p className="leading-relaxed mb-6">
                    The AI-powered website builder designed specifically for the industrial sector. Smart, fast, and professional.
                </p>
                <div className="flex gap-4">
                    {/* Social Icons Placeholder */}
                    <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors cursor-pointer">X</div>
                    <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors cursor-pointer">In</div>
                </div>
            </div>
            
            <div>
                <h4 className="text-white font-bold mb-6">Product</h4>
                <ul className="space-y-4">
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Features</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Pricing</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Showcase</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Integrations</a></li>
                </ul>
            </div>
            
            <div>
                <h4 className="text-white font-bold mb-6">Resources</h4>
                <ul className="space-y-4">
                    <li><Link href="/blog" className="hover:text-blue-400 transition-colors">Blog</Link></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Documentation</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Community</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Help Center</a></li>
                </ul>
            </div>
            
            <div>
                <h4 className="text-white font-bold mb-6">Company</h4>
                <ul className="space-y-4">
                    <li><a href="#" className="hover:text-blue-400 transition-colors">About Us</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Careers</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Legal</a></li>
                    <li><a href="#" className="hover:text-blue-400 transition-colors">Contact</a></li>
                </ul>
            </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>© 2026 Shpitto Inc. All rights reserved.</div>
          <div className="flex gap-8">
            <Link href="/legal/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/legal/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
