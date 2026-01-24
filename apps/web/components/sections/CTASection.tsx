"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

export interface CTASectionProps {
  title: string;
  description?: string;
  ctaText: string;
  ctaLink?: string;
  variant?: "simple" | "split" | "card";
}

export const CTASection = ({ 
  title, 
  description, 
  ctaText, 
  ctaLink = "#",
  variant = "simple" 
}: CTASectionProps) => {
  
  if (variant === "card") {
    return (
      <div className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto bg-[var(--accent)] rounded-3xl overflow-hidden shadow-2xl relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="relative z-10 px-8 py-16 md:p-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">{title}</h2>
            {description && <p className="text-white/80 text-lg mb-10 max-w-2xl mx-auto">{description}</p>}
            <a 
              href={ctaLink} 
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[var(--accent)] font-bold rounded-full hover:shadow-lg hover:scale-105 transition-all"
            >
              {ctaText}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "split") {
    return (
      <div className="py-24 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold mb-4">{title}</h2>
            {description && <p className="text-slate-400 text-lg">{description}</p>}
          </div>
          <div className="flex-shrink-0">
            <a 
              href={ctaLink} 
              className="inline-flex items-center gap-2 px-8 py-4 bg-[var(--accent)] text-white font-bold rounded-full hover:opacity-90 hover:shadow-lg hover:-translate-y-1 transition-all"
            >
              {ctaText}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Simple variant (default)
  return (
    <div className="py-24 bg-[color:var(--accent)]/10 border-t border-[color:var(--accent)]/20">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">{title}</h2>
        {description && <p className="text-slate-600 text-lg mb-10 max-w-2xl mx-auto">{description}</p>}
        <a 
          href={ctaLink} 
          className="inline-flex items-center gap-2 px-8 py-4 bg-[var(--accent)] text-white font-bold rounded-full shadow-lg hover:opacity-90 hover:-translate-y-1 transition-all"
        >
          {ctaText}
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};
