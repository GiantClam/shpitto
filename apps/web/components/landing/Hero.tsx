import Link from "next/link";
import { ArrowRight, Sparkles, Code2, Rocket, PlayCircle } from "lucide-react";

export function Hero() {
  return (
    <section className="pt-32 pb-20 lg:pt-48 lg:pb-40 px-6 relative overflow-hidden bg-[#0A0F1C] text-white">
      {/* Dynamic Background Grid */}
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>
      
      {/* Glowing Gradient Orb */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] -z-10 pointer-events-none mix-blend-screen"></div>
      
      <div className="max-w-7xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium mb-8 backdrop-blur-sm animate-fade-in-up">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          v2.0 Now Available
        </div>
        
        <h1 className="text-5xl lg:text-8xl font-bold tracking-tight mb-8 leading-[1.1] animate-fade-in-up [animation-delay:100ms]">
          Build Industrial Sites <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-200 to-white drop-shadow-sm">
            With Just a Chat.
          </span>
        </h1>
        
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-in-up [animation-delay:200ms]">
          Shpitto turns your natural language into production-grade industrial websites. 
          No drag-and-drop fatigue. Just describe, review, and ship.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up [animation-delay:300ms]">
          <Link href="/login" className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-xl text-lg hover:bg-blue-500 transition-all shadow-[0_0_40px_-10px_rgba(37,99,235,0.5)] hover:shadow-[0_0_60px_-10px_rgba(37,99,235,0.6)] hover:-translate-y-1 flex items-center justify-center gap-2 group">
            Start Building Free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <button className="w-full sm:w-auto px-8 py-4 bg-white/5 text-white font-medium rounded-xl text-lg border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2 backdrop-blur-sm">
            <PlayCircle className="w-5 h-5" />
            Watch Demo
          </button>
        </div>

        {/* Mock Interface / Floating Preview */}
        <div className="mt-20 relative mx-auto max-w-5xl animate-fade-in-up [animation-delay:500ms]">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative rounded-xl bg-[#0F1623] border border-slate-800 shadow-2xl overflow-hidden aspect-[16/9] flex flex-col">
            {/* Window Controls */}
            <div className="h-10 border-b border-slate-800 bg-[#0A0F1C] flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
              <div className="ml-4 px-3 py-1 rounded-md bg-slate-800/50 text-[10px] text-slate-500 font-mono">shpitto-builder-v1</div>
            </div>
            
            {/* Content Area */}
            <div className="flex-1 flex relative">
              {/* Sidebar */}
              <div className="w-64 border-r border-slate-800 bg-[#0A0F1C] p-4 hidden md:block">
                <div className="h-8 w-24 bg-slate-800/50 rounded mb-6 animate-pulse"></div>
                <div className="space-y-3">
                    <div className="h-4 w-full bg-slate-800/30 rounded"></div>
                    <div className="h-4 w-3/4 bg-slate-800/30 rounded"></div>
                    <div className="h-4 w-5/6 bg-slate-800/30 rounded"></div>
                </div>
              </div>
              
              {/* Main Canvas */}
              <div className="flex-1 bg-[#0F1623] p-8 flex items-center justify-center relative overflow-hidden">
                 {/* Abstract UI Elements */}
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)]"></div>
                 
                 <div className="w-full max-w-2xl space-y-6 relative z-10">
                    <div className="h-12 w-3/4 bg-slate-800/50 rounded-lg mx-auto backdrop-blur-md border border-slate-700/50 flex items-center px-4 text-slate-500 font-mono text-sm">
                        <span className="text-blue-400 mr-2">➜</span> Describe your industrial website...
                        <span className="ml-auto w-2 h-4 bg-blue-500 animate-blink"></span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mt-8 opacity-50">
                        <div className="h-32 bg-slate-800/30 rounded-lg border border-slate-700/30"></div>
                        <div className="h-32 bg-slate-800/30 rounded-lg border border-slate-700/30"></div>
                        <div className="h-32 bg-slate-800/30 rounded-lg border border-slate-700/30"></div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
