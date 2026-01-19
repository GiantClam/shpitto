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

// 2. Page & Component Config (Puck-Compatible)
export const PuckComponentSchema = z.object({
  type: z.string(), // Matches frontend atomic component name, e.g., "Hero", "SpecsTable"
  props: z.record(z.any()), // Component text, R2 image links
  overrides: z.object({ // Core: Allows AI to inject fine-tuned Tailwind class names
    className: z.string().optional()
  }).optional()
});

export const PuckDataSchema = z.object({
  root: z.record(z.any()).optional(), // Puck root props
  content: z.array(PuckComponentSchema),
  zones: z.record(z.any()).optional(), // For Puck zones if needed
});

export type PuckData = z.infer<typeof PuckDataSchema>;

// 3. Complete Project Blueprint
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
