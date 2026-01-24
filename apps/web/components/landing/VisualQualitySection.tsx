import { ArrowUpRight, Palette, Layout, MousePointer2 } from "lucide-react";

export function VisualQualitySection() {
  const features = [
    {
      title: "Adaptive Typography",
      description: "Smart font pairing engine that ensures perfect readability.",
      icon: <Layout className="w-6 h-6 text-blue-400" />,
      colSpan: "md:col-span-2",
      bg: "bg-gradient-to-br from-blue-900/50 to-slate-900/50"
    },
    {
      title: "Micro-Interactions",
      description: "Subtle animations that delight.",
      icon: <MousePointer2 className="w-6 h-6 text-purple-400" />,
      colSpan: "md:col-span-1",
      bg: "bg-gradient-to-br from-purple-900/50 to-slate-900/50"
    },
    {
      title: "Color Harmony",
      description: "AI-generated palettes that match your brand identity perfectly.",
      icon: <Palette className="w-6 h-6 text-emerald-400" />,
      colSpan: "md:col-span-1",
      bg: "bg-gradient-to-br from-emerald-900/50 to-slate-900/50"
    },
    {
      title: "Responsive Grids",
      description: "Layouts that adapt fluidly to any device size.",
      icon: <Layout className="w-6 h-6 text-orange-400" />,
      colSpan: "md:col-span-2",
      bg: "bg-gradient-to-br from-orange-900/50 to-slate-900/50"
    }
  ];

  return (
    <section id="showcase" className="py-32 bg-[#0A0F1C] relative">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
      
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-6">
             Design Excellence
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-white tracking-tight">Engineered for Aesthetics</h2>
          <p className="text-lg text-slate-400 leading-relaxed">
            Shpitto doesn't just write code; it composes experiences. Every generated site is built on a foundation of modern design principles.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((item, i) => (
            <div 
                key={i} 
                className={`${item.colSpan} group relative rounded-3xl overflow-hidden border border-white/5 hover:border-white/10 transition-all duration-500`}
            >
              <div className={`absolute inset-0 ${item.bg} opacity-20 group-hover:opacity-30 transition-opacity`}></div>
              <div className="absolute inset-0 backdrop-blur-3xl -z-10"></div>
              
              <div className="relative p-8 h-full flex flex-col justify-between min-h-[240px]">
                <div className="mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                        {item.icon}
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">{item.title}</h3>
                    <p className="text-slate-400 text-lg leading-relaxed">{item.description}</p>
                </div>
                
                <div className="flex items-center gap-2 text-sm font-bold text-white/50 group-hover:text-white transition-colors">
                    Learn more <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
