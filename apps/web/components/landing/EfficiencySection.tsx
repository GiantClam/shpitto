import { CheckCircle2, Zap, MessageSquare, LayoutTemplate } from "lucide-react";

export function EfficiencySection() {
  return (
    <section id="features" className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="relative order-2 lg:order-1">
             {/* Abstract UI representation */}
             <div className="relative bg-slate-900 rounded-2xl shadow-2xl p-2 border border-slate-800 transform lg:-rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="bg-slate-800 rounded-xl overflow-hidden aspect-[4/3] relative">
                    {/* Chat Interface Mockup */}
                    <div className="absolute inset-y-0 left-0 w-1/3 border-r border-slate-700 bg-slate-800/50 p-4 flex flex-col gap-3">
                        <div className="w-full h-2 bg-slate-600 rounded-full w-3/4"></div>
                        <div className="w-full h-8 bg-blue-600/20 border border-blue-500/30 rounded-lg"></div>
                        <div className="w-full h-16 bg-slate-700/50 rounded-lg mt-auto"></div>
                    </div>
                    {/* Preview Interface Mockup */}
                    <div className="absolute inset-y-0 right-0 w-2/3 bg-slate-50 p-4">
                         <div className="w-full h-32 bg-blue-100 rounded-lg mb-4"></div>
                         <div className="grid grid-cols-2 gap-2">
                             <div className="h-20 bg-slate-200 rounded-lg"></div>
                             <div className="h-20 bg-slate-200 rounded-lg"></div>
                         </div>
                    </div>
                </div>
                
                {/* Floating Badge */}
                <div className="absolute -right-6 bottom-8 bg-white p-4 rounded-xl shadow-xl border border-slate-100 animate-bounce">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 font-semibold uppercase">Generation Time</div>
                            <div className="text-lg font-bold text-slate-900">12 Seconds</div>
                        </div>
                    </div>
                </div>
             </div>
          </div>
          
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wider mb-6">
              Efficiency First
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold mb-6 text-slate-900">
              No more blank pages.<br />
              <span className="text-blue-600">Smart generation at your fingertips.</span>
            </h2>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              Traditional web development takes weeks. Shipitto cuts that down to minutes.
              Just describe your business, and our AI engine instantly generates a complete website with copy, images, and layout.
            </p>
            
            <div className="space-y-6">
                <div className="flex gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 text-blue-600">
                        <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-lg mb-1">Understands Your Business Logic</h3>
                        <p className="text-slate-600">Not just generating text, but understanding industry terminology and business processes to create precise, professional content.</p>
                    </div>
                </div>
                
                <div className="flex gap-4">
                    <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0 text-purple-600">
                        <LayoutTemplate className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-lg mb-1">Automated Content Architecture</h3>
                        <p className="text-slate-600">Automatically generates key sections like Hero, Features, and FAQ based on SEO best practices.</p>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
