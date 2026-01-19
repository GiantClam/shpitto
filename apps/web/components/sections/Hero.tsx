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
  align = "text-left", 
  theme = "dark", 
  effect = "none" 
}: HeroProps) => {
  const cta = ctaText || cta_text || "Learn More";
  const desc = description || subtitle;

  return (
    <div className={cn(
      "relative min-h-[70vh] flex items-center overflow-hidden py-24",
      theme === "dark" ? "bg-slate-950 text-white" : "bg-white text-slate-900",
      theme === "glass" && "bg-slate-50/50 backdrop-blur-xl",
      align === "text-center" ? "justify-center text-center" : "justify-start text-left"
    )}>
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
          <button className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold transition-all shadow-lg shadow-blue-500/25">
            {cta}
          </button>
        </motion.div>
      </div>
    </div>
  );
};
