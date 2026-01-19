import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 px-6 relative overflow-hidden bg-slate-50">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100 via-transparent to-transparent opacity-50"></div>
      
      {/* Background Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-400/5 rounded-full blur-3xl -z-10 animate-pulse"></div>
      
      <div className="max-w-7xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider mb-8 shadow-sm hover:bg-blue-100 transition-colors cursor-default">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          AI-Powered Industrial Web Builder
        </div>
        
        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">
          BUILDING SMART,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">GROWING FAST.</span>
        </h1>
        
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-12 leading-relaxed">
          Say goodbye to blank pages. Generate professional, high-performance industrial websites with AI.
          <br className="hidden md:block" />
          Fewest turns, highest precision.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/login" className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-xl text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 hover:shadow-2xl hover:shadow-blue-300 hover:-translate-y-1 flex items-center justify-center gap-2 group">
            Start Building Free 
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link href="#showcase" className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 font-bold rounded-xl text-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center shadow-sm hover:shadow-md">
            View Showcase
          </Link>
        </div>
        
        {/* Stats / Trust Badges */}
        <div className="mt-16 pt-8 border-t border-slate-200/60 flex flex-wrap justify-center gap-8 md:gap-16 opacity-70 grayscale">
          <div className="flex items-center gap-2 font-semibold text-slate-500">
            <span className="text-2xl font-bold text-slate-800">500+</span> Sites Built
          </div>
          <div className="flex items-center gap-2 font-semibold text-slate-500">
            <span className="text-2xl font-bold text-slate-800">10x</span> Faster Launch
          </div>
          <div className="flex items-center gap-2 font-semibold text-slate-500">
             Trusted by Industry Leaders
          </div>
        </div>
      </div>
    </section>
  );
}
