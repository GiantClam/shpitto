import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/test-deploy-final/route";

describe("LC-CNC deploy test flow", () => {
  it("calls the main deployment flow and returns 6-page metadata", async () => {
    const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const originalApiToken = process.env.CLOUDFLARE_API_TOKEN;

    // Force CloudflareClient into mock mode for deterministic tests.
    process.env.CLOUDFLARE_ACCOUNT_ID = "";
    process.env.CLOUDFLARE_API_TOKEN = "";

    try {
      const req = new NextRequest("http://localhost/api/test-deploy-final");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.pageCount).toBe(6);
      expect(json.expectedRoutes).toEqual(["/", "/company", "/products", "/news", "/cases", "/contact"]);
      expect(json.url).toContain(".pages.dev");
    } finally {
      process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
      process.env.CLOUDFLARE_API_TOKEN = originalApiToken;
    }
  });
});
