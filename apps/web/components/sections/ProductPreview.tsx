"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";

export interface ProductItem {
  title: string;
  description: string;
  image?: string;
  tag?: string;
}

export interface ProductPreviewProps {
  title?: string;
  items: ProductItem[];
}

export const ProductPreview = ({ title, items }: ProductPreviewProps) => (
  <section className="bg-white py-32">
    <div className="container mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-20 text-center"
      >
        <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
          {title || "Featured Products"}
        </h2>
      </motion.div>
      
      <BentoGrid className="mx-auto max-w-7xl">
        {(items || []).map((item, i) => (
          <BentoGridItem
            key={item.title || i}
            title={item.title}
            description={item.description}
            header={
              <div className="flex h-full min-h-[6rem] w-full flex-1 rounded-xl bg-gradient-to-br from-neutral-200 dark:from-neutral-900 dark:to-neutral-800 to-neutral-100 overflow-hidden">
                {item.image && (
                  <img 
                    src={item.image} 
                    alt={item.title} 
                    className="h-full w-full object-cover transition-transform duration-500 group-hover/bento:scale-110" 
                  />
                )}
              </div>
            }
            className={cn(
              "group/bento",
              i === 3 || i === 6 ? "md:col-span-2" : ""
            )}
            icon={
              item.tag && (
                <span className="inline-block rounded-full bg-[color:var(--accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                  {item.tag}
                </span>
              )
            }
          />
        ))}
      </BentoGrid>
    </div>
  </section>
);
