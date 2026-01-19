import Link from "next/link";
import { ArrowLeft, Calendar, User, Clock, Share2 } from "lucide-react";

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  // This would typically come from a CMS or database based on the slug
  const post = {
    title: "The Future of Industrial Web Design: AI-Driven & Data-First",
    date: "Oct 24, 2025",
    author: "Sarah Chen",
    readTime: "8 min read",
    category: "Industry Trends",
    image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1200",
    content: `
      <p class="lead">The industrial sector has historically lagged behind in digital adoption. While B2C companies embraced e-commerce and personalized experiences a decade ago, many manufacturing and industrial firms are still relying on static brochure websites that haven't been updated in years. That is changing rapidly.</p>

      <h2>The Shift to Semantic Search</h2>
      <p>Search engines are no longer just matching keywords; they are understanding intent. For industrial companies, this means your website needs to structure technical data in a way that AI and search engines can parse. It's not enough to list "CNC Machining"; you need to detail tolerances, material capabilities, and capacity in structured formats.</p>

      <h2>Automated Content Generation</h2>
      <p>Writing technical documentation is time-consuming. AI is revolutionizing this by allowing engineers to input raw specs and getting polished, SEO-optimized product pages in seconds. This isn't just about speed; it's about consistency and accuracy across thousands of SKUs.</p>

      <h2>Data-First Design</h2>
      <p>Modern industrial buyers are data-driven. They want to see CAD files, performance charts, and real-time inventory. Your website needs to be more than a marketing tool; it needs to be a functional tool for engineers and procurement officers.</p>

      <blockquote>"The companies that will win in the next decade are those that treat their website as a digital product, not a digital brochure."</blockquote>

      <h2>Conclusion</h2>
      <p>The barrier to entry for high-quality digital experiences has lowered significantly. With tools like Shipitto, industrial companies can now launch world-class websites that rival Fortune 500 companies, without the 6-month development cycle.</p>
    `
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center gap-4">
          <Link href="/blog" className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors group">
            <ArrowLeft className="w-5 h-5 text-slate-500 group-hover:text-slate-900" />
          </Link>
          <span className="font-bold text-sm text-slate-500 uppercase tracking-wider">Back to Blog</span>
        </div>
      </header>

      <main className="pb-24">
        {/* Hero Image */}
        <div className="w-full h-[400px] lg:h-[500px] relative">
            <img 
                src={post.image} 
                alt={post.title} 
                className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <div className="absolute bottom-0 left-0 w-full p-6 lg:p-12">
                <div className="max-w-4xl mx-auto">
                    <div className="inline-block px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold uppercase tracking-wider mb-4">
                        {post.category}
                    </div>
                    <h1 className="text-3xl lg:text-5xl font-bold text-white mb-6 leading-tight max-w-3xl">
                        {post.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-6 text-white/90 text-sm font-medium">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                                <User className="w-4 h-4" />
                            </div>
                            {post.author}
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {post.date}
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {post.readTime}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-12">
            <article className="prose prose-lg prose-slate max-w-none">
                <div dangerouslySetInnerHTML={{ __html: post.content }} />
            </article>

            <aside className="hidden lg:block">
                <div className="sticky top-24 space-y-8">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <h3 className="font-bold text-slate-900 mb-4">Share this article</h3>
                        <div className="flex gap-2">
                            <button className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                <Share2 className="w-4 h-4" />
                            </button>
                            {/* Add social share buttons here */}
                        </div>
                    </div>
                    
                    <div className="bg-blue-600 p-6 rounded-2xl text-white">
                        <h3 className="font-bold text-lg mb-2">Build your industrial site today</h3>
                        <p className="text-blue-100 text-sm mb-4">Start generating professional content in minutes.</p>
                        <Link href="/login" className="block w-full py-3 bg-white text-blue-600 text-center font-bold rounded-xl hover:bg-blue-50 transition-colors">
                            Get Started
                        </Link>
                    </div>
                </div>
            </aside>
        </div>
      </main>
    </div>
  );
}
