import { describe, expect, it } from "vitest";
import { ProjectSchema } from "@industry/schema";
import {
  applyAtomicPatch,
  generateSkeletonProject,
  injectOrganizationJsonLd,
  normalizeComponentType,
  stitchTracks,
} from "./engine";

describe("normalizeComponentType", () => {
  it("maps common aliases to canonical component types", () => {
    expect(normalizeComponentType("Product_Preview")).toBe("ProductPreview");
    expect(normalizeComponentType("Value_Propositions")).toBe("ValuePropositions");
    expect(normalizeComponentType("CTA_Section")).toBe("CTASection");
    expect(normalizeComponentType("Feature_Highlight")).toBe("FeatureHighlight");
  });
});

describe("stitchTracks", () => {
  it("merges architect content with copy/style patches by component id", () => {
    const architect = {
      projectId: "p1",
      branding: {
        name: "Acme",
        colors: { primary: "#0052FF", accent: "#22C55E" },
        style: { borderRadius: "sm", typography: "Inter" },
      },
      pages: [
        {
          path: "/",
          seo: { title: "Home | Acme", description: "x" },
          puckData: {
            root: {},
            content: [
              { id: "hero_01", type: "Hero", props: { title: "t" } },
              { id: "faq_01", type: "FAQ", props: { items: [] } },
            ],
          },
        },
      ],
    };

    const copy = {
      payload: {
        hero_01: { title: "New Title", subtitle: "Sub" },
      },
    };

    const style = {
      payload: {
        hero_01: { theme: "dark", effect: "retro-grid" },
      },
    };

    const merged = stitchTracks(architect as any, [copy as any, style as any]);
    const hero = merged.pages[0].puckData.content[0];
    expect(hero.props.title).toBe("New Title");
    expect(hero.props.subtitle).toBe("Sub");
    expect(hero.props.theme).toBe("dark");
    expect(hero.props.effect).toBe("retro-grid");
  });
});

describe("applyAtomicPatch", () => {
  it("updates a component prop by id and dot-path", () => {
    const project = {
      projectId: "p1",
      branding: {
        name: "Acme",
        colors: { primary: "#0052FF", accent: "#22C55E" },
        style: { borderRadius: "sm", typography: "Inter" },
      },
      pages: [
        {
          path: "/",
          seo: { title: "Home | Acme", description: "x" },
          puckData: {
            root: {},
            content: [{ id: "hero_01", type: "Hero", props: { title: "Old" } }],
          },
        },
      ],
    };

    const patched = applyAtomicPatch(project as any, {
      id: "hero_01",
      path: "props.title",
      value: "New",
    });

    expect(patched.pages[0].puckData.content[0].props.title).toBe("New");
  });
});

describe("injectOrganizationJsonLd", () => {
  it("injects schema.org json-ld into puck root props", () => {
    const project = {
      projectId: "p1",
      branding: {
        name: "Acme",
        colors: { primary: "#0052FF", accent: "#22C55E" },
        style: { borderRadius: "sm", typography: "Inter" },
      },
      pages: [
        {
          path: "/",
          seo: { title: "Home | Acme", description: "x" },
          puckData: { root: {}, content: [{ id: "hero_01", type: "Hero", props: { title: "t" } }] },
        },
      ],
    };

    const out = injectOrganizationJsonLd(project as any);
    const raw = out.pages[0].puckData.root?.props?.seoSchema;
    expect(typeof raw).toBe("string");
    const json = JSON.parse(raw);
    expect(json["@context"]).toBe("https://schema.org");
    expect(json["@type"]).toBe("Organization");
    expect(json.name).toBe("Acme");
  });
});

describe("project schema", () => {
  it("validates the stitched result", () => {
    const project = {
      projectId: "p1",
      branding: {
        name: "Acme",
        colors: { primary: "#0052FF", accent: "#22C55E" },
        style: { borderRadius: "sm", typography: "Inter" },
      },
      pages: [
        {
          path: "/",
          seo: { title: "Home | Acme", description: "x" },
          puckData: { root: {}, content: [{ id: "hero_01", type: "Hero", props: { title: "t" } }] },
        },
      ],
    };

    const result = ProjectSchema.safeParse(project);
    expect(result.success).toBe(true);
  });
});

describe("generateSkeletonProject", () => {
  it("creates stable component ids and required fields", () => {
    const project = generateSkeletonProject({
      brandingName: "Acme",
      primary: "#0052FF",
      accent: "#22C55E",
      paths: ["/", "/about"],
    });

    const home = project.pages.find((p: any) => p.path === "/");
    expect(home.puckData.content.length).toBeGreaterThan(0);
    expect(home.puckData.content[0].id).toMatch(/_0\d$/);

    const result = ProjectSchema.safeParse(project);
    expect(result.success).toBe(true);
  });
});
