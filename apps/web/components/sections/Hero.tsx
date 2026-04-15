"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import RetroGrid from "@/components/ui/retro-grid";

export interface HeroProps {
  title: string;
  description?: string;
  subtitle?: string;
  ctaText?: string;
  cta_text?: string;
  image?: string;
  backgroundImage?: string;
  ctaButtons?: Array<{
    text?: string;
    href?: string;
    variant?: "primary" | "secondary";
  }>;
  align?: "text-left" | "text-center";
  theme?: "dark" | "light" | "glass";
  effect?: "none" | "retro-grid";
}

export const Hero = ({ 
  title, 
  description, 
  subtitle, 
  ctaText, 
  cta_text, 
  image, 
  backgroundImage,
  ctaButtons = [],
  align = "text-left", 
  theme = "dark", 
  effect = "none" 
}: HeroProps) => {
  const cta = ctaText || cta_text || "Learn More";
  const desc = description || subtitle;
  const bgImage = backgroundImage || image;
  const normalizedButtons =
    Array.isArray(ctaButtons) && ctaButtons.length > 0
      ? ctaButtons.filter((btn) => (btn?.text || "").trim()).slice(0, 2)
      : [];

  return (
    <div className={cn(
      "relative min-h-[70vh] flex items-center overflow-hidden py-24",
      theme === "dark" ? "bg-slate-950 text-white" : "bg-white text-slate-900",
      theme === "glass" && "bg-slate-50/50 backdrop-blur-xl",
      align === "text-center" ? "justify-center text-center" : "justify-start text-left"
    )}>
      {bgImage ? (
        <>
          <img src={bgImage} alt={title || "Hero"} className="absolute inset-0 w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-black/30" />
        </>
      ) : null}
      {effect === "retro-grid" && <RetroGrid />}
      
      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            {title}
          </h1>
          {desc && (
            <p className={cn(
              "text-xl md:text-2xl mb-10 leading-relaxed",
              theme === "dark" ? "text-slate-400" : "text-slate-600"
            )}>
              {desc}
            </p>
          )}
          {normalizedButtons.length > 0 ? (
            <div className={cn("flex flex-wrap gap-3", align === "text-center" ? "justify-center" : "justify-start")}>
              {normalizedButtons.map((btn, idx) => (
                <a
                  key={`${btn.href || "#"}-${idx}`}
                  href={btn.href || "#"}
                  className={cn(
                    "px-8 py-4 rounded-full font-bold transition-all shadow-lg hover:opacity-90",
                    btn.variant === "secondary"
                      ? "bg-white/15 border border-white/40 text-white"
                      : "bg-[var(--accent)] text-white",
                  )}
                >
                  {btn.text}
                </a>
              ))}
            </div>
          ) : (
            <button className="px-8 py-4 bg-[var(--accent)] text-white rounded-full font-bold transition-all shadow-lg hover:opacity-90">
              {cta}
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
};
