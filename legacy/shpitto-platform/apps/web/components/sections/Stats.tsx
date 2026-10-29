"use client";

import React from "react";

export interface StatsItem {
  label: string;
  value: string;
  suffix?: string;
}

export interface StatsProps {
  items: StatsItem[];
}

export const Stats = ({ items }: StatsProps) => (
  <div className="bg-white py-24">
    <div className="max-w-7xl mx-auto px-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
        {items?.map((item, i) => (
          <div key={item.label || i} className="flex flex-col items-center text-center">
            <div className="text-6xl md:text-7xl font-black text-slate-900 mb-2 tracking-tighter">
              {item.value}<span className="text-[var(--accent)]">{item.suffix}</span>
            </div>
            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
