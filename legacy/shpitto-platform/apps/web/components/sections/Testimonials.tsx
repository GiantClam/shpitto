"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface TestimonialItem {
  content: string;
  author: string;
  role: string;
}

export interface TestimonialsProps {
  title?: string;
  items: TestimonialItem[];
}

export const Testimonials = ({ title, items }: TestimonialsProps) => (
  <div className="bg-slate-50 py-24">
    <div className="max-w-7xl mx-auto px-4">
      <h2 className="text-4xl font-black mb-16 text-slate-900 uppercase italic tracking-tighter">
        {title || "Voices of Trust"}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {items?.map((item, i) => (
          <div key={item.author || i} className="bg-white p-12 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all">
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 group-hover:w-4 transition-all" />
            <div className="text-6xl text-slate-100 absolute top-4 right-8 font-serif">“</div>
            <p className="text-xl text-slate-600 mb-8 relative z-10 leading-relaxed font-medium italic">
              {item.content}
            </p>
            <div>
              <div className="font-black text-slate-900 uppercase tracking-tight">{item.author}</div>
              <div className="text-sm font-bold text-blue-600 uppercase tracking-widest">{item.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
