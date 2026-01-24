"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQProps {
  title?: string;
  items: FAQItem[];
}

export const FAQ = ({ title, items }: FAQProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        {title && <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">{title}</h2>}
        
        <div className="space-y-4">
          {items?.map((item, i) => (
            <div 
              key={i} 
              className={`border rounded-2xl transition-all duration-300 ${
                openIndex === i ? 'border-blue-200 bg-blue-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-6 text-left focus:outline-none"
              >
                <span className={`font-bold text-lg ${openIndex === i ? 'text-blue-700' : 'text-slate-800'}`}>
                  {item.question}
                </span>
                <ChevronDown 
                  className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openIndex === i ? 'rotate-180 text-blue-500' : ''}`} 
                />
              </button>
              
              <div 
                className={`grid transition-all duration-300 ease-in-out ${
                  openIndex === i ? 'grid-rows-[1fr] opacity-100 pb-6' : 'grid-rows-[0fr] opacity-0 pb-0'
                }`}
              >
                <div className="overflow-hidden px-6">
                  <p className="text-slate-600 leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
