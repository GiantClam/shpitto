import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import path from "node:path";
import dotenv from "dotenv";
import { GET } from "../../app/api/test-deploy-final/route";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });
process.env.CLOUDFLARE_REQUIRE_REAL = "1";

describe("LC-CNC deploy test flow", () => {
  it(
    "calls the main deployment flow and returns 6-page metadata",
    async () => {
      expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
      expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);

      const req = new NextRequest("http://localhost/api/test-deploy-final");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.pageCount).toBe(6);
      expect(json.expectedRoutes).toEqual(["/", "/company", "/products", "/news", "/cases", "/contact"]);
      expect(json.url).toContain(".pages.dev");
    },
    900000,
  );
});
