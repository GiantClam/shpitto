"use client";

import React from "react";
import { Check } from "lucide-react";

export interface FeatureHighlightProps {
  title?: string;
  description?: string;
  image?: string;
  align?: "left" | "right";
  features?: string[];
}

export const FeatureHighlight = ({ 
  title, 
  description, 
  image, 
  align = "left",
  features = []
}: FeatureHighlightProps) => {
  const isLeft = align === "left";

  return (
    <div className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className={`flex flex-col lg:flex-row items-center gap-16 ${!isLeft ? 'lg:flex-row-reverse' : ''}`}>
          {/* Image Side */}
          <div className="w-full lg:w-1/2 relative">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-100 group">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              {image ? (
                <img 
                  src={image} 
                  alt={title || "Feature"} 
                  className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
                />
              ) : (
                <div className="w-full aspect-[4/3] bg-slate-100 flex items-center justify-center text-slate-400">
                  Image Placeholder
                </div>
              )}
            </div>
            {/* Decorative dots */}
            <div className={`absolute -z-10 w-24 h-24 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 top-[-20px] ${isLeft ? 'left-[-20px]' : 'right-[-20px]'}`}></div>
          </div>

          {/* Content Side */}
          <div className="w-full lg:w-1/2">
            {title && <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-6 leading-tight">{title}</h2>}
            {description && <p className="text-lg text-slate-600 mb-8 leading-relaxed">{description}</p>}
            
            {features && features.length > 0 && (
              <ul className="space-y-4">
                {features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="mt-1 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700 font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
