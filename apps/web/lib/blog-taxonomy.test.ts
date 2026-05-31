import { describe, expect, it } from "vitest";
import {
  blogCategoryHref,
  blogTagHref,
  blogTaxonomyMatches,
  collectBlogTaxonomyMap,
  formatBlogTaxonomyDisplayLabel,
  humanizeBlogTaxonomySlug,
  slugifyBlogTaxonomy,
} from "./blog-taxonomy";

describe("blog taxonomy helpers", () => {
  it("slugifies labels into stable lowercase taxonomy slugs", () => {
    expect(slugifyBlogTaxonomy("Industry Trends")).toBe("industry-trends");
    expect(slugifyBlogTaxonomy("Growth & Strategy")).toBe("growth-and-strategy");
    expect(slugifyBlogTaxonomy(" Trading   Company ")).toBe("trading-company");
  });

  it("matches labels against slug route segments", () => {
    expect(blogTaxonomyMatches("Industry Trends", "industry-trends")).toBe(true);
    expect(blogTaxonomyMatches("Trading Company", "trading-company")).toBe(true);
    expect(blogTaxonomyMatches("Manufacturer Website", "trading-company")).toBe(false);
  });

  it("builds taxonomy hrefs from labels", () => {
    expect(blogCategoryHref("Industry Trends")).toBe("/blog/category/industry-trends");
    expect(blogTagHref("Trading Company")).toBe("/blog/tag/trading-company");
  });

  it("humanizes slug fallbacks for metadata", () => {
    expect(humanizeBlogTaxonomySlug("industry-trends")).toBe("Industry Trends");
  });

  it("formats lowercase taxonomy labels for display", () => {
    expect(formatBlogTaxonomyDisplayLabel("export website")).toBe("Export Website");
    expect(formatBlogTaxonomyDisplayLabel("seo")).toBe("SEO");
    expect(formatBlogTaxonomyDisplayLabel("b2b website")).toBe("B2B Website");
  });

  it("deduplicates taxonomy maps by slug", () => {
    const map = collectBlogTaxonomyMap(["Industry Trends", "industry trends", "Growth Strategy"]);
    expect(Array.from(map.keys())).toEqual(["industry-trends", "growth-strategy"]);
  });
});
