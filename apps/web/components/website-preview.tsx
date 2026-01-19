"use client";

import { Render, Config, Data } from "@measured/puck";
import "@measured/puck/puck.css";
import React, { useMemo } from "react";
import { Hero } from "./sections/Hero";
import { Stats } from "./sections/Stats";
import { Testimonials } from "./sections/Testimonials";
import { ValuePropositions } from "./sections/ValuePropositions";
import { ProductPreview } from "./sections/ProductPreview";
import { RootLayout } from "./sections/RootLayout";

// -----------------------------------------------------------------------------
// PUCK CONFIGURATION
// -----------------------------------------------------------------------------

const config: Config = {
  root: {
    fields: {
      title: { type: "text" },
      branding: {
        type: "object",
        objectFields: {
          name: { type: "text" },
          logo: { type: "text" },
          colors: {
            type: "object",
            objectFields: {
              primary: { type: "text" },
              accent: { type: "text" }
            }
          }
        }
      }
    },
    render: RootLayout
  },
  components: {
    Hero: {
      fields: {
        title: { type: "text" },
        description: { type: "textarea" },
        subtitle: { type: "textarea" },
        ctaText: { type: "text" },
        cta_text: { type: "text" },
        image: { type: "text" },
        align: { type: "select", options: [{label: "Left", value: "text-left"}, {label: "Center", value: "text-center"}] },
        theme: { type: "select", options: [{label: "Dark", value: "dark"}, {label: "Light", value: "light"}, {label: "Glass", value: "glass"}] },
        effect: { type: "select", options: [{label: "None", value: "none"}, {label: "Retro Grid", value: "retro-grid"}] }
      },
      render: Hero
    },

    Stats: {
        fields: {
            items: { type: "array", arrayFields: { label: { type: "text" }, value: { type: "text" }, suffix: { type: "text" } } }
        },
        render: Stats
    },

    Testimonials: {
        fields: {
            title: { type: "text" },
            items: { type: "array", arrayFields: { content: { type: "textarea" }, author: { type: "text" }, role: { type: "text" } } }
        },
        render: Testimonials
    },

    Value_Propositions: {
        fields: {
            title: { type: "text" },
            items: { type: "array", arrayFields: { title: { type: "text" }, description: { type: "text" }, icon: { type: "text" } } }
        },
        render: ValuePropositions
    },

    Product_Preview: {
      fields: {
        title: { type: "text" },
        items: {
          type: "array",
          getItemSummary: (item: any) => item.title || "Product Item",
          arrayFields: {
            title: { type: "text" },
            description: { type: "textarea" },
            image: { type: "text" },
            tag: { type: "text" }
          }
        }
      },
      render: ProductPreview
    },
  }
};

interface WebsitePreviewProps {
  data: Data;
  project_json?: any;
  onNavigate?: (path: string) => void;
}

export function WebsitePreview({ data, project_json, onNavigate }: WebsitePreviewProps) {
  const mergedData = useMemo(() => {
    if (!project_json) return data;
    
    // Ensure all content items have unique IDs to prevent React key warnings in Puck's DropZone
    const content = (data.content || []).map((item, idx) => ({
        ...item,
        // If the item doesn't have an ID (or has a duplicate), generate a stable one based on index
        props: {
            ...item.props,
            id: item.props.id || `puck-item-${idx}-${Date.now()}`
        }
    }));

    return {
      ...data,
      content, // Use the sanitized content array
      root: {
        ...data.root,
        props: {
          ...(data.root?.props || {}),
          branding: project_json.branding,
          project_json: project_json,
          onNavigate: onNavigate
        }
      }
    };
  }, [data, project_json, onNavigate]);

  return <Render config={config} data={mergedData} />;
}
