/**
 * PUCK COMPONENT REGISTRY
 * This file defines the exact schema and examples for each component to improve LLM generation accuracy.
 */

export const COMPONENT_REGISTRY = {
  Hero: {
    description: "The primary visual section at the top of the page.",
    props_schema: {
      title: "string (required)",
      description: "string (optional)",
      subtitle: "string (optional)",
      ctaText: "string (optional, e.g., 'Get Started')",
      image: "string (URL, optional)",
      align: "'text-left' | 'text-center' (default: 'text-left')",
      theme: "'dark' | 'light' | 'glass' (default: 'dark')",
      effect: "'none' | 'retro-grid' (default: 'none')"
    },
    example: {
      type: "Hero",
      props: {
        title: "Revolutionize Your Logistics",
        description: "Seamless global shipping with Shpitto's AI-powered platform.",
        ctaText: "Start Shipping",
        align: "text-center",
        theme: "dark",
        effect: "retro-grid"
      }
    }
  },
  Stats: {
    description: "Display key metrics or achievements.",
    props_schema: {
      items: "Array of { label: string, value: string, suffix: string }"
    },
    example: {
      type: "Stats",
      props: {
        items: [
          { label: "Active Users", value: "50,000", suffix: "+" },
          { label: "Countries Served", value: "190", suffix: "" },
          { label: "Delivery Success", value: "99.9", suffix: "%" }
        ]
      }
    }
  },
  Testimonials: {
    description: "Customer reviews and social proof.",
    props_schema: {
      title: "string (optional)",
      items: "Array of { content: string, author: string, role: string }"
    },
    example: {
      type: "Testimonials",
      props: {
        title: "What Our Clients Say",
        items: [
          { content: "Shpitto has transformed our supply chain management.", author: "Jane Doe", role: "CEO at TechCorp" }
        ]
      }
    }
  },
  ValuePropositions: {
    description: "Key benefits or features of the service.",
    props_schema: {
      title: "string (optional)",
      items: "Array of { title: string, description: string, icon: string (Lucide icon name) }"
    },
    example: {
      type: "ValuePropositions",
      props: {
        title: "Why Choose Us",
        items: [
          { title: "Real-time Tracking", description: "Monitor your cargo every step of the way.", icon: "MapPin" }
        ]
      }
    }
  },
  ProductPreview: {
    description: "Showcase products or services in a grid.",
    props_schema: {
      title: "string (optional)",
      items: "Array of { title: string, description: string, image: string, link: string, price: string (optional) }"
    },
    example: {
      type: "ProductPreview",
      props: {
        title: "Our Solutions",
        items: [
          { title: "Express Freight", description: "Next-day delivery for high-priority cargo.", image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d", link: "/services/express" }
        ]
      }
    }
  },
  FeatureHighlight: {
    description: "Alternating image and text sections to highlight specific features or stories. Great for 'About Us' or detailed service descriptions.",
    props_schema: {
      title: "string",
      description: "string",
      image: "string (URL)",
      align: "'left' | 'right' (default: 'left' - image position)",
      ctaText: "string (optional)",
      ctaLink: "string (optional)"
    },
    example: {
      type: "FeatureHighlight",
      props: {
        title: "Sustainable Practices",
        description: "We are committed to reducing our carbon footprint through eco-friendly packaging and optimized routing algorithms.",
        image: "https://images.unsplash.com/photo-1542601906990-b4d3fb7d5fa5",
        align: "right",
        ctaText: "Read Our Report"
      }
    }
  },
  Content_Block: {
    description: "A flexible text block for narratives, mission statements, or general information.",
    props_schema: {
      title: "string (optional)",
      content: "string (supports basic markdown or long text)",
      align: "'left' | 'center' (default: 'left')"
    },
    example: {
      type: "Content_Block",
      props: {
        title: "Our Mission",
        content: "To connect the world through seamless, sustainable, and intelligent logistics solutions that empower businesses of all sizes.",
        align: "center"
      }
    }
  },
  CTASection: {
    description: "A dedicated Call-to-Action section to drive conversions.",
    props_schema: {
      title: "string",
      description: "string (optional)",
      ctaText: "string",
      ctaLink: "string (optional)",
      theme: "'dark' | 'light' | 'primary' (default: 'primary')"
    },
    example: {
      type: "CTASection",
      props: {
        title: "Ready to Get Started?",
        description: "Join thousands of satisfied customers today.",
        ctaText: "Create Account",
        theme: "primary"
      }
    }
  },
  FAQ: {
    description: "Frequently Asked Questions accordion.",
    props_schema: {
      title: "string (optional)",
      items: "Array of { question: string, answer: string }"
    },
    example: {
      type: "FAQ",
      props: {
        title: "Common Questions",
        items: [
          { question: "How do I track my shipment?", answer: "You can use our real-time tracking tool on the dashboard." }
        ]
      }
    }
  },
  Logos: {
    description: "Grid of client or partner logos to build trust.",
    props_schema: {
      title: "string (optional)",
      items: "Array of { name: string, logo: string (URL) }"
    },
    example: {
      type: "Logos",
      props: {
        title: "Trusted By",
        items: [
          { name: "Acme Corp", logo: "https://logo.clearbit.com/acme.com" }
        ]
      }
    }
  }
};

export const REGISTRY_PROMPT_SNIPPET = `
### ⚠️ IMPORTANT: STRICT COMPONENT SCHEMA ⚠️
You must strictly follow the JSON structure for each component. Any deviation will cause rendering errors.

${Object.entries(COMPONENT_REGISTRY).map(([name, info]) => `
#### ${name}
- **Description**: ${info.description}
- **Props Schema**: ${JSON.stringify(info.props_schema, null, 2)}
- **Correct JSON Example**:
${JSON.stringify(info.example, null, 2)}
`).join('\n')}

### GENERAL RULES:
1. Every item in the 'content' array must have a "type" (string) and "props" (object).
2. "type" MUST exactly match one of the registry keys above (e.g., use 'ProductPreview', not 'Product_Preview').
3. Props must contain only the fields specified in the schema.
4. Do NOT wrap the JSON in Markdown backticks. Return ONLY the raw JSON array.
`;
