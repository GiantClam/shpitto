import { z } from "zod";

// 1. Global Branding Styles
export const BrandingSchema = z.object({
  tenantId: z.string().uuid().optional(), 
  name: z.string(), // 品牌名称
  logo: z.string().optional(), // Logo URL
  colors: z.object({
    primary: z.string().regex(/^#[0-9A-F]{6}$/i), 
    accent: z.string().regex(/^#[0-9A-F]{6}$/i),
  }),
  style: z.object({
    borderRadius: z.enum(["none", "sm", "md", "lg"]), // Industrial style tends towards "none" or "sm"
    typography: z.string(), // e.g., "Inter" or "Oswald"
  })
});

export type Branding = z.infer<typeof BrandingSchema>;

// 2. Component Props Schemas
const HeroPropsSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  ctaText: z.string().optional(),
  image: z.string().optional(),
  align: z.enum(["text-left", "text-center"]).default("text-left"),
  theme: z.enum(["dark", "light", "glass"]).default("dark"),
  effect: z.enum(["none", "retro-grid"]).default("none")
});

const StatsPropsSchema = z.object({
  items: z.array(z.object({
    label: z.string(),
    value: z.string(),
    suffix: z.string().optional()
  }))
});

const TestimonialsPropsSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    content: z.string(),
    author: z.string(),
    role: z.string().optional()
  }))
});

const ValuePropositionsPropsSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string().optional()
  }))
});

const ProductPreviewPropsSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    title: z.string(),
    description: z.string(),
    image: z.string().optional(),
    tag: z.string().optional()
  }))
});

// 3. Page & Component Config (Puck-Compatible)
// We use a discriminated union to enforce type safety based on component name
export const PuckComponentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Hero"),
    props: HeroPropsSchema,
  }),
  z.object({
    type: z.literal("Stats"),
    props: StatsPropsSchema,
  }),
  z.object({
    type: z.literal("Testimonials"),
    props: TestimonialsPropsSchema,
  }),
  z.object({
    type: z.literal("Value_Propositions"),
    props: ValuePropositionsPropsSchema,
  }),
  z.object({
    type: z.literal("Product_Preview"),
    props: ProductPreviewPropsSchema,
  })
]);

export const PuckDataSchema = z.object({
  root: z.record(z.any()).optional(), // Puck root props
  content: z.array(PuckComponentSchema),
  zones: z.record(z.any()).optional(), // For Puck zones if needed
});

export type PuckData = z.infer<typeof PuckDataSchema>;

// 4. Complete Project Blueprint
export const ProjectSchema = z.object({
  projectId: z.string(),
  branding: BrandingSchema,
  pages: z.array(z.object({
    path: z.string(), // Route
    seo: z.object({ title: z.string(), description: z.string() }),
    puckData: PuckDataSchema
  })),
  logicHooks: z.array(z.object({ // Interaction logic binding
    trigger: z.string(), // e.g., "onInquirySubmit"
    action: z.string()  // Corresponding Pages Functions name
  })).optional()
});

export type Project = z.infer<typeof ProjectSchema>;
