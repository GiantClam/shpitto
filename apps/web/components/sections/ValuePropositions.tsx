"use client";

import React from "react";

export interface ValuePropositionItem {
  title: string;
  description: string;
  icon?: string;
}

export interface ValuePropositionsProps {
  title?: string;
  items: ValuePropositionItem[];
}

export const ValuePropositions = ({ title, items }: ValuePropositionsProps) => (
  <div className="max-w-7xl mx-auto px-4 py-16 bg-white">
    {title && <h2 className="text-3xl font-bold text-center mb-12 text-slate-900">{title}</h2>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
      {items?.map((item, i) => (
        <div key={item.title || i} className="p-8 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
          <h3 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">✓</span>
            {item.title}
          </h3>
          <p className="text-slate-500 leading-relaxed">{item.description}</p>
        </div>
      ))}
    </div>
  </div>
);
