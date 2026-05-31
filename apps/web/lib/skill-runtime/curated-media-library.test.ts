import { describe, expect, it } from "vitest";
import { selectCuratedLibraryImage } from "./curated-media-library";

describe("curated media library", () => {
  it("selects a portfolio homepage image for consultant-style personal sites", () => {
    const image = selectCuratedLibraryImage(
      "/",
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
    );

    expect(image?.src).toContain("images.unsplash.com");
    expect(image?.alt).toContain("workspace");
  });

  it("selects an editorial archive image for blog routes", () => {
    const image = selectCuratedLibraryImage(
      "/blog",
      "Build a writing-led publication with essays, field notes, and editorial archives.",
    );

    expect(image?.src).toContain("images.unsplash.com");
    expect(image?.caption).toContain("Field notes");
  });

  it("does not assign curated portfolio imagery to unrelated enterprise product routes", () => {
    const image = selectCuratedLibraryImage(
      "/products",
      "Build a bilingual towel and textile export company site with pool, beach, and hospitality references.",
    );

    expect(image).toBeUndefined();
  });
});
