"use client";

import React from "react";

export interface LogoItem {
  name: string;
  logo: string;
}

export interface LogosProps {
  title?: string;
  items: LogoItem[];
}

export const Logos = ({ title, items }: LogosProps) => {
  return (
    <div className="py-16 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-6 text-center">
        {title && (
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-10">
            {title}
          </p>
        )}
        
        <div className="flex flex-wrap justify-center items-center gap-12 md:gap-16 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
          {items?.map((item, i) => (
            <div key={i} className="group relative">
              <img 
                src={item.logo} 
                alt={item.name} 
                className="h-8 md:h-10 w-auto object-contain transition-transform group-hover:scale-110"
              />
              {/* Tooltip on hover */}
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-slate-900 whitespace-nowrap bg-white px-2 py-1 rounded shadow-md border border-slate-100 pointer-events-none">
                {item.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
