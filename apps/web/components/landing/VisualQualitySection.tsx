import { ArrowUpRight } from "lucide-react";

export function VisualQualitySection() {
  const cases = [
    {
        title: "EcoTech Solutions",
        category: "Renewable Energy",
        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=800",
        color: "bg-emerald-500"
    },
    {
        title: "Apex Robotics",
        category: "Industrial Automation",
        image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=800",
        color: "bg-blue-500"
    },
    {
        title: "Quantum Logistics",
        category: "Global Supply Chain",
        image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800",
        color: "bg-indigo-500"
    }
  ];

  return (
    <section id="showcase" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold uppercase tracking-wider mb-6">
             Design Excellence
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold mb-6 text-slate-900">4A Level Visual Experience</h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            We don't just generate code; we generate design. Shipitto deep-learns from thousands of industry-leading examples
            to ensure every generation meets top-tier design standards, balancing aesthetics with conversion rates.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {cases.map((item, i) => (
            <div key={i} className="group cursor-pointer relative">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden mb-5 relative shadow-lg group-hover:shadow-2xl transition-all duration-500 group-hover:-translate-y-2">
                <div className={`absolute inset-0 ${item.color} opacity-0 group-hover:opacity-20 transition-opacity z-10 mix-blend-multiply`}></div>
                <img 
                    src={item.image} 
                    alt={item.title} 
                    className="object-cover w-full h-full transform group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/80 to-transparent z-20 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                    <span className="text-xs font-bold text-white/80 uppercase tracking-wider mb-1 block">{item.category}</span>
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white">{item.title}</h3>
                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity delay-100">
                            <ArrowUpRight className="w-4 h-4" />
                        </div>
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-16 text-center">
            <button className="px-8 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-full hover:bg-slate-50 transition-colors">
                Explore More Examples
            </button>
        </div>
      </div>
    </section>
  );
}
