import { describe, expect, it, vi } from "vitest";
import { renderLocalAuthBody, resolveProjectAuthApiBase } from "./executor";
import type { PageBlueprint } from "./decision-layer";

const mocks = vi.hoisted(() => ({
  getOwnedProjectSummary: vi.fn(),
  listProjectCustomDomains: vi.fn(),
}));

vi.mock("../agent/db.ts", () => ({
  getOwnedProjectSummary: mocks.getOwnedProjectSummary,
  listProjectCustomDomains: mocks.listProjectCustomDomains,
}));

function makeBlueprint(route: string): PageBlueprint {
  return {
    route,
    navLabel: route,
    purpose: "Auth page",
    source: "default",
    constraints: ["brand theme", "return path", "no detached auth UI"],
    pageKind: "auth",
    responsibility: "Keep auth aligned with the site theme.",
    contentSkeleton: ["Auth hero", "Auth form"],
    componentMix: { hero: 20, feature: 0, grid: 0, proof: 10, form: 60, cta: 10 },
  };
}

describe("renderLocalAuthBody", () => {
  it("renders a login form shell with route-preserving links", () => {
    const html = renderLocalAuthBody({
      route: "/login",
      locale: "en",
      title: "Login",
      blueprint: makeBlueprint("/login"),
    });

    expect(html).toContain('data-shpitto-auth-form="login"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('data-shpitto-auth-link="secondary"');
    expect(html).toContain('data-shpitto-auth-link="tertiary"');
  });

  it("renders register, reset, and verify shells with their required fields", () => {
    const registerHtml = renderLocalAuthBody({
      route: "/register",
      locale: "en",
      title: "Register",
      blueprint: makeBlueprint("/register"),
    });
    const resetHtml = renderLocalAuthBody({
      route: "/reset-password",
      locale: "en",
      title: "Reset password",
      blueprint: makeBlueprint("/reset-password"),
    });
    const verifyHtml = renderLocalAuthBody({
      route: "/verify-email",
      locale: "en",
      title: "Verify email",
      blueprint: makeBlueprint("/verify-email"),
    });

    expect(registerHtml).toContain('data-shpitto-auth-form="register"');
    expect(registerHtml).toContain('name="confirmPassword"');
    expect(resetHtml).toContain('data-shpitto-auth-form="reset-password"');
    expect(resetHtml).toContain('name="confirmPassword"');
    expect(verifyHtml).toContain('data-shpitto-auth-form="verify-email"');
    expect(verifyHtml).toContain('name="email"');
  });
});

describe("resolveProjectAuthApiBase", () => {
  it("prefers the project's bound custom domain", async () => {
    mocks.listProjectCustomDomains.mockResolvedValue([
      { hostname: "auth.example.com", status: "active" },
    ]);
    mocks.getOwnedProjectSummary.mockResolvedValue({
      latestDeploymentUrl: "https://preview.pages.dev",
      deploymentHost: "preview.pages.dev",
    });

    await expect(resolveProjectAuthApiBase({ projectId: "project-1", userId: "user-1" })).resolves.toBe(
      "https://auth.example.com",
    );
  });

  it("falls back to the latest deployment origin when no custom domain is bound", async () => {
    mocks.listProjectCustomDomains.mockResolvedValue([]);
    mocks.getOwnedProjectSummary.mockResolvedValue({
      latestDeploymentUrl: "https://preview.pages.dev/path",
      deploymentHost: "preview.pages.dev",
    });

    await expect(resolveProjectAuthApiBase({ projectId: "project-1", userId: "user-1" })).resolves.toBe(
      "https://preview.pages.dev",
    );
  });
});
