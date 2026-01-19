export const TEST_PROJECT_LuxeWeave = {
  projectId: "luxe-weave-global",
  branding: {
    name: "LuxeWeave Global",
    colors: {
      primary: "#0f172a",
      accent: "#2563eb"
    },
    style: {
      borderRadius: "lg",
      typography: "Inter"
    }
  },
  pages: [
    {
      path: "/",
      seo: {
        title: "LuxeWeave | Premium Industrial Textiles",
        description: "Leading manufacturer of high-performance industrial fabrics for global markets."
      },
      puckData: {
        content: [
          {
            id: "hero-1",
            type: "Hero",
            props: {
              title: "Crafting the Future of Industrial Textiles",
              description: "High-performance fabrics engineered for durability, safety, and sustainability.",
              cta_text: "Explore Products",
              theme: "dark",
              effect: "retro-grid"
            }
          },
          {
            id: "stats-1",
            type: "Stats",
            props: {
              items: [
                { label: "Years Excellence", value: "25", suffix: "+" },
                { label: "Global Clients", value: "1.2", suffix: "k" },
                { label: "Certifications", value: "15", suffix: "" }
              ]
            }
          },
          {
            id: "products-1",
            type: "Product_Preview",
            props: {
              title: "Our Specialized Solutions",
              items: [
                { 
                  title: "Aero-Grade Synthetics", 
                  description: "Ultra-lightweight materials for aerospace applications.",
                  image: "https://images.unsplash.com/photo-1559064515-52425020f899",
                  tag: "High-Tech"
                },
                { 
                  title: "Eco-Shield Canvas", 
                  description: "100% recycled industrial-strength canvas.",
                  image: "https://images.unsplash.com/photo-1582719188393-bb71ca45dbb9",
                  tag: "Sustainable"
                }
              ]
            }
          }
        ]
      }
    }
  ]
};
