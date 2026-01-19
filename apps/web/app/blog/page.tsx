import Link from "next/link";
import { ArrowLeft, Calendar, User, ArrowRight } from "lucide-react";

export default function BlogIndexPage() {
  const posts = [
    {
      title: "The Future of Industrial Web Design: AI-Driven & Data-First",
      slug: "future-of-industrial-web-design",
      excerpt: "How AI is transforming the way manufacturing companies build their digital presence, moving from static brochures to dynamic lead generation engines. In this article, we explore the shift towards semantic search, automated content generation, and the importance of structured data for industrial SEO.",
      date: "Oct 24, 2025",
      author: "Sarah Chen",
      category: "Industry Trends",
      image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "Case Study: How Apex Robotics Doubled Leads in 30 Days",
      slug: "apex-robotics-case-study",
      excerpt: "A deep dive into how a robotics startup used Shipitto to rebuild their site and optimize for conversion speed. By implementing our 'Clarity & Comparison' layout strategy, Apex was able to reduce bounce rates by 45% and increase quote requests by 120%.",
      date: "Nov 02, 2025",
      author: "Mike Ross",
      category: "Case Study",
      image: "https://images.unsplash.com/photo-1565514020176-dbf227780065?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "SEO for Manufacturers: 5 Key Strategies for 2026",
      slug: "seo-for-manufacturers-2026",
      excerpt: "Why traditional B2B SEO is dead, and how to structure your product catalog for the semantic search era. Learn why 'long-tail keywords' are being replaced by 'topic clusters' and how to adapt your content strategy.",
      date: "Nov 15, 2025",
      author: "Alex V.",
      category: "Growth Strategy",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800"
    },
    {
        title: "From CAD to Conversion: Visualizing Complex Products",
        slug: "from-cad-to-conversion",
        excerpt: "Best practices for showcasing technical products on the web without overwhelming non-technical buyers. We discuss the balance between technical specifications and benefit-driven messaging.",
        date: "Nov 20, 2025",
        author: "David Kim",
        category: "Design",
        image: "https://images.unsplash.com/photo-1537462713205-e512d5b4d849?auto=format&fit=crop&q=80&w=800"
    },
    {
        title: "The ROI of Speed: Why Site Performance Matters in B2B",
        slug: "roi-of-speed-b2b",
        excerpt: "Slow sites lose contracts. We analyze data from 500+ industrial websites to show the direct correlation between page load speed and RFQ submission rates.",
        date: "Nov 28, 2025",
        author: "Sarah Chen",
        category: "Performance",
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800"
    }
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5 text-slate-500" />
            </Link>
            <span className="font-bold text-xl tracking-tight">Shipitto Blog</span>
          </div>
          <Link href="/login" className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-full hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
             Start Building
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-16 max-w-2xl mx-auto">
            <h1 className="text-4xl lg:text-5xl font-bold mb-6 text-slate-900">Insights for Industrial Growth</h1>
            <p className="text-lg text-slate-600">
                Expert advice, case studies, and trends to help you build a better digital presence for your manufacturing or industrial business.
            </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
            {posts.map((post, i) => (
                <Link key={i} href={`/blog/${post.slug}`} className="flex flex-col group cursor-pointer">
                    <div className="aspect-[16/10] bg-slate-100 rounded-2xl overflow-hidden mb-6 relative shadow-sm hover:shadow-xl transition-all duration-500">
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
                    
                    <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">
                        {post.title}
                    </h2>
                    
                    <p className="text-slate-600 leading-relaxed mb-4 flex-grow line-clamp-3">
                        {post.excerpt}
                    </p>
                    
                    <div className="flex items-center gap-2 text-blue-600 font-bold mt-auto group-hover:gap-3 transition-all">
                        Read Full Story <ArrowRight className="w-4 h-4" />
                    </div>
                </Link>
            ))}
        </div>
      </main>

      <footer className="py-12 bg-slate-50 border-t border-slate-200 mt-20 text-center text-slate-500 text-sm">
        <p>© 2026 Shipitto Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
