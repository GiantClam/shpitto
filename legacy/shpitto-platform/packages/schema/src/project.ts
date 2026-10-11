import { z } from "zod";

// --- Atomic Component Schemas ---

export const NavbarPropsSchema = z.object({
  logo: z.string(),
  links: z.array(z.object({
    label: z.string(),
    url: z.string()
  }))
});

export const FooterPropsSchema = z.object({
  copyright: z.string(),
  links: z.array(z.object({
    label: z.string(),
    url: z.string()
  }))
});

export const SectionPropsSchema = z.object({
  background: z.string().optional(),
  padding: z.string().optional(),
  className: z.string().optional(),
  items: z.array(z.lazy(() => ComponentSchema)) // Recursive definition
});

export const HeadingPropsSchema = z.object({
  text: z.string(),
  level: z.enum(["h1", "h2", "h3"]),
  align: z.enum(["text-left", "text-center", "text-right"]).optional(),
  className: z.string().optional()
});

export const TextPropsSchema = z.object({
  content: z.string(),
  align: z.enum(["text-left", "text-center", "text-right"]).optional(),
  className: z.string().optional()
});

export const ProductGridPropsSchema = z.object({
  category: z.string(),
  limit: z.number().optional(),
  className: z.string().optional()
});

// --- Component Union ---

export const ComponentSchema: z.ZodType<any> = z.object({
  id: z.string().optional(),
  type: z.string(), // We use loose string matching for flexibility, validated by business logic
  props: z.record(z.any()), // Specific validation happens at runtime or via refined schemas
  overrides: z.object({
    className: z.string().optional()
  }).optional()
}).transform((data) => {
    // Self-healing: Fix props list -> dict
    if (Array.isArray(data.props)) {
        if (data.type === "Columns") {
            data.props = { columns: data.props };
        } else {
            data.props = { items: data.props };
        }
    }
    
    // Recursive Fix for nested items (e.g. Columns -> columns -> items -> item)
    if (data.props && typeof data.props === 'object') {
        const props = data.props;
        
        // Fix 'items' array (used in Section)
        if (Array.isArray(props.items)) {
            props.items = props.items.map((item: any) => {
                if (typeof item === 'object' && !item.props && item.type) {
                    // Wrap flat item in props
                    const { type, readOnly, ...rest } = item;
                    return { type, props: rest, readOnly };
                }
                return item;
            });
        }

        // Fix 'columns' array (used in Columns)
        if (Array.isArray(props.columns)) {
            props.columns = props.columns.map((col: any) => {
                if (col && Array.isArray(col.items)) {
                    col.items = col.items.map((item: any) => {
                        if (typeof item === 'object' && !item.props && item.type) {
                             const { type, readOnly, ...rest } = item;
                             return { type, props: rest, readOnly };
                        }
                        return item;
                    });
                }
                return col;
            });
        }
    }
    return data;
});

// --- Project Blueprint Schema (Updated to sync with global ProjectSchema) ---

export const BrandingSchema = z.object({
  tenantId: z.string().uuid().optional(), 
  name: z.string(), 
  logo: z.string().optional(),
  colors: z.object({
    primary: z.string().regex(/^#[0-9A-F]{6}$/i), 
    accent: z.string().regex(/^#[0-9A-F]{6}$/i),
  }),
  style: z.object({
    borderRadius: z.enum(["none", "sm", "md", "lg"]), 
    typography: z.string(),
  })
});

export const PuckDataSchema = z.object({
  root: z.record(z.any()).optional(),
  content: z.array(z.object({
    id: z.string(),
    type: z.string(),
    props: z.record(z.any()),
    overrides: z.object({ className: z.string().optional() }).optional()
  })),
  zones: z.record(z.any()).optional(),
});

export const ProjectSchema = z.object({
  projectId: z.string(),
  branding: BrandingSchema,
  pages: z.array(z.object({
    path: z.string(), 
    seo: z.object({ title: z.string(), description: z.string() }),
    puckData: PuckDataSchema
  })),
  logicHooks: z.array(z.object({
    trigger: z.string(),
    action: z.string()
  })).optional()
});

export type ProjectBlueprint = z.infer<typeof ProjectSchema>;
