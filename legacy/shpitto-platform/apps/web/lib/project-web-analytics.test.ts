import { beforeEach, describe, expect, it, vi } from "vitest";
import { provisionProjectWebAnalyticsSite, shouldProvisionWebAnalytics } from "./project-web-analytics";

const mocks = vi.hoisted(() => ({
  upsertProjectSiteBinding: vi.fn(),
}));

vi.mock("@/lib/agent/db", () => ({
  upsertProjectSiteBinding: mocks.upsertProjectSiteBinding,
}));

describe("project web analytics provisioning", () => {
  beforeEach(() => {
    mocks.upsertProjectSiteBinding.mockReset();
  });

  it("provisions analytics for a bound custom domain and stores the custom host", async () => {
    const cf = {
      ensureWebAnalyticsSite: vi.fn().mockResolvedValue({
        siteId: "site-1",
        siteTag: "tag-1",
        siteToken: "token-1",
        host: "snapsclean.com",
      }),
    };

    const result = await provisionProjectWebAnalyticsSite({
      projectId: "project-1",
      userId: "user-1",
      deploymentUrl: "https://shpitto-chat-1778638147239-yoh11u-930d5607-4.pages.dev",
      host: "snapsclean.com",
      cf: cf as any,
    });

    expect(result.status).toBe("active");
    expect(result.warning).toBe("");
    expect(cf.ensureWebAnalyticsSite).toHaveBeenCalledWith("snapsclean.com");
    expect(mocks.upsertProjectSiteBinding).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "https://shpitto-chat-1778638147239-yoh11u-930d5607-4.pages.dev",
      expect.objectContaining({
        analyticsProvider: "cloudflare_web_analytics",
        analyticsStatus: "active",
        cfWaHost: "snapsclean.com",
        cfWaSiteId: "site-1",
        cfWaSiteTag: "tag-1",
        cfWaSiteToken: "token-1",
      }),
    );
  });

  it("keeps pages.dev preview deployments disabled by default", () => {
    const prev = process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
    try {
      delete process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
      expect(shouldProvisionWebAnalytics("demo.pages.dev")).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
      else process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV = prev;
    }
  });
});
