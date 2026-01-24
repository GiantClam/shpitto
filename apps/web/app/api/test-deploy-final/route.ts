import { NextRequest, NextResponse } from "next/server";
import { Bundler } from "../../../lib/bundler";
import { CloudflareClient } from "../../../lib/cloudflare";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const cf = new CloudflareClient();
    const testProjectName = `shpitto-fresh-${Date.now().toString().slice(-4)}`;
    
    console.log(`[Test] Starting final test for project: ${testProjectName}`);
    
    // 1. Create/Update project
    await cf.createProject(testProjectName);
    
    // Wait for project to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 2. Create bundle with full site content
    const config = {
      branding: {
        name: "LuxeWeave Global",
        logo: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=100&h=100&fit=crop",
        colors: {
          primary: "#1e293b",
          accent: "#3b82f6"
        }
      },
      pages: [
        {
          path: "/",
          seo: { title: "LuxeWeave | Premium Textile Solutions", description: "Global leader in sustainable textile manufacturing and innovation." },
          puckData: {
            content: [
              {
                type: "Hero",
                props: {
                  title: "Crafting the Future of Textiles",
                  subtitle: "Sustainable, high-performance fabrics for global industries.",
                  ctaText: "Explore Collection",
                  theme: "dark",
                  effect: "retro-grid"
                }
              },
              {
                type: "Stats",
                props: {
                  items: [
                    { label: "Countries", value: "50+" },
                    { label: "Factories", value: "12" },
                    { label: "Sustainable", value: "100%" },
                    { label: "Awards", value: "24" }
                  ]
                }
              },
              {
                type: "ProductPreview",
                props: {
                  title: "SmartFabric™ Technology",
                  description: "Our proprietary weave integration provides unprecedented durability and moisture-wicking capabilities.",
                  features: ["UV Protection", "Zero-Waste Process", "Ultra-Lightweight"],
                  image: "https://images.unsplash.com/photo-1558230334-f256348f959c?w=800&h=600&fit=crop"
                }
              }
            ]
          }
        },
        {
          path: "/about",
          seo: { title: "About Us | LuxeWeave", description: "Our heritage of excellence since 1985." },
          puckData: {
            content: [
              {
                type: "Hero",
                props: {
                  title: "Our Heritage",
                  subtitle: "Four decades of pushing the boundaries of what fabric can do.",
                  theme: "light",
                  align: "text-center"
                }
              },
              {
                type: "Testimonials",
                props: {
                  title: "Trusted by Industry Leaders",
                  items: [
                    { author: "Jane Smith", position: "CEO, EcoFashion", quote: "LuxeWeave transformed our supply chain with their innovative approach." },
                    { author: "Marc Chen", position: "Director, TechGear", quote: "The most reliable partner we've had in 20 years of manufacturing." }
                  ]
                }
              }
            ]
          }
        }
      ]
    };
    const bundle = await Bundler.createBundle(config);
    
    // 3. Upload deployment (3-step flow)
    console.log("[Test] Uploading bundle with manifest paths:", Object.keys(bundle.manifest));
    const result = await cf.uploadDeployment(testProjectName, bundle);
    
    return NextResponse.json({
      success: true,
      projectName: testProjectName,
      deployment: result
    });
  } catch (e: any) {
    console.error("[Test] Final test failed:", e);
    return NextResponse.json({
      success: false,
      error: e.message,
      stack: e.stack
    }, { status: 500 });
  }
}
