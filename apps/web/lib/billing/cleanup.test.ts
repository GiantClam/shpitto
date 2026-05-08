import { describe, expect, it } from "vitest";
import { pagesProjectNameFromUrl } from "./cleanup";

describe("billing cleanup", () => {
  it("extracts Cloudflare Pages project names from deployment URLs", () => {
    expect(pagesProjectNameFromUrl("https://shpitto-demo.pages.dev")).toBe("shpitto-demo");
    expect(pagesProjectNameFromUrl("shpitto-demo.pages.dev/path")).toBe("shpitto-demo");
    expect(pagesProjectNameFromUrl("https://example.com")).toBeUndefined();
  });
});
