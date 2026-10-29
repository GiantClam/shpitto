import { describe, expect, it } from "vitest";
import { CloudflareClient } from "./cloudflare";

describe("CloudflareClient Pages project config", () => {
  it("writes D1 bindings into production and preview deployment configs", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    let patchBody: any;

    try {
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          patchBody = JSON.parse(String(init.body || "{}"));
        }
        return new Response(JSON.stringify({ success: true, result: { name: "site" } }), { status: 200 });
      }) as typeof fetch;

      await new CloudflareClient().createProject("site", {
        bindingName: "BLOG_DB",
        databaseId: "d1-id",
      });

      expect(patchBody.deployment_configs.production.d1_databases).toEqual({
        BLOG_DB: { id: "d1-id" },
      });
      expect(patchBody.deployment_configs.preview.d1_databases).toEqual({
        BLOG_DB: { id: "d1-id" },
      });
      expect(patchBody.deployment_configs.production.fail_open).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
    }
  });
});
