import { describe, expect, it } from "vitest";
import {
  appendReferencedAssetsBlock,
  collectReferencedAssetsFromTexts,
  parseReferencedAssetsFromText,
} from "./referenced-assets";

describe("referenced-assets", () => {
  it("parses referenced assets block and strips it from clean text", () => {
    const parsed = parseReferencedAssetsFromText(
      [
        "Build a website for LC-CNC.",
        "",
        "[Referenced Assets]",
        '- Asset "logo.png" URL: https://example.com/logo.png',
        '- Asset "spec.pdf" URL: https://example.com/spec.pdf',
      ].join("\n"),
    );

    expect(parsed.cleanText).toBe("Build a website for LC-CNC.");
    expect(parsed.referencedAssets).toEqual([
      'Asset "logo.png" URL: https://example.com/logo.png',
      'Asset "spec.pdf" URL: https://example.com/spec.pdf',
    ]);
  });

  it("appends normalized referenced assets block", () => {
    const merged = appendReferencedAssetsBlock("Base prompt", [
      'Asset "logo.png" URL: https://example.com/logo.png',
      'Asset "logo.png" URL: https://example.com/logo.png',
    ]);

    expect(merged).toContain("Base prompt");
    expect(merged).toContain("[Referenced Assets]");
    const bulletLines = merged
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));
    expect(bulletLines).toHaveLength(1);
  });

  it("collects and deduplicates assets across messages", () => {
    const assets = collectReferencedAssetsFromTexts([
      '[Referenced Assets]\n- Asset "a.png" URL: https://x/a.png',
      'Need this.\n\n[Referenced Assets]\n- Asset "a.png" URL: https://x/a.png\n- Asset "b.pdf" URL: https://x/b.pdf',
    ]);

    expect(assets).toEqual([
      'Asset "a.png" URL: https://x/a.png',
      'Asset "b.pdf" URL: https://x/b.pdf',
    ]);
  });
});
