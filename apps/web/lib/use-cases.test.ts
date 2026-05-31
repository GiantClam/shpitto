import { describe, expect, it } from "vitest";
import { findUseCaseByBlogCategory, findUseCasesByBlogCategories, getUseCaseBySlug, getUseCaseHref } from "./use-cases";

describe("use case helpers", () => {
  it("returns stable use case hrefs", () => {
    expect(getUseCaseHref("manufacturers")).toBe("/use-cases/manufacturers");
    expect(getUseCaseHref("trading-companies")).toBe("/use-cases/trading-companies");
  });

  it("finds use cases by slug", () => {
    expect(getUseCaseBySlug("industrial-suppliers")?.label).toBe("Industrial Supplier Website");
    expect(getUseCaseBySlug("missing")).toBeNull();
  });

  it("maps blog categories to use cases", () => {
    expect(findUseCaseByBlogCategory("Manufacturer Website")?.slug).toBe("manufacturers");
    expect(findUseCaseByBlogCategory("Product Catalog Website")?.slug).toBe("industrial-suppliers");
  });

  it("deduplicates multiple categories into unique use cases", () => {
    expect(
      findUseCasesByBlogCategories(["Manufacturer Website", "Trading Company Website", "Manufacturer Website"]).map((item) => item.slug),
    ).toEqual(["manufacturers", "trading-companies"]);
  });
});
