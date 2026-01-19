import Link from "next/link";
import { ArrowRight, Calendar, User } from "lucide-react";

export function BlogSection() {
  const posts = [
    {
      title: "The Future of Industrial Web Design: AI-Driven & Data-First",
      slug: "future-of-industrial-web-design",
      excerpt: "How AI is transforming the way manufacturing companies build their digital presence, moving from static brochures to dynamic lead generation engines.",
      date: "Oct 24, 2025",
      author: "Sarah Chen",
      category: "Industry Trends",
      image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "Case Study: How Apex Robotics Doubled Leads in 30 Days",
      slug: "apex-robotics-case-study",
      excerpt: "A deep dive into how a robotics startup used Shipitto to rebuild their site and optimize for conversion speed.",
      date: "Nov 02, 2025",
      author: "Mike Ross",
      category: "Case Study",
      image: "https://images.unsplash.com/photo-1565514020176-dbf227780065?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "SEO for Manufacturers: 5 Key Strategies for 2026",
      slug: "seo-for-manufacturers-2026",
      excerpt: "Why traditional B2B SEO is dead, and how to structure your product catalog for the semantic search era.",
      date: "Nov 15, 2025",
      author: "Alex V.",
      category: "Growth Strategy",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800"
    }
  ];

  return (
    <section id="blog" className="py-24 bg-white border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4">
              Latest Insights
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Industry Insights & Stories</h2>
          </div>
          <Link href="/blog" className="hidden md:flex items-center gap-2 text-blue-600 font-bold hover:gap-3 transition-all">
            View All Articles <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {posts.map((post, i) => (
            <Link key={i} href={`/blog/${post.slug}`} className="group cursor-pointer flex flex-col h-full">
              <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden mb-6 relative">
                <img 
                  src={post.image} 
                  alt={post.title} 
                  className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-slate-700 uppercase tracking-wide">
                  {post.category}
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {post.date}
                </div>
                <div className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {post.author}
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors line-clamp-2">
                {post.title}
              </h3>
              
              <p className="text-slate-600 text-sm leading-relaxed mb-4 line-clamp-3 flex-grow">
                {post.excerpt}
              </p>
              
              <div className="flex items-center gap-2 text-blue-600 font-bold text-sm group-hover:gap-3 transition-all mt-auto">
                Read Article <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
        
        <div className="mt-12 md:hidden text-center">
           <Link href="/blog" className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-full hover:bg-slate-50 transition-colors">
            View All Articles
          </Link>
        </div>
      </div>
    </section>
  );
}
