import { describe, expect, it } from "vitest";
import { rewriteProjectAssetLogicalUrls, toProjectAssetLogicalPath } from "./project-assets";

describe("project-assets URL rewriting", () => {
  it("builds stable logical paths for generated website code", () => {
    expect(toProjectAssetLogicalPath("uploads/logo.png")).toBe("/assets/project/uploads/logo.png");
  });

  it("rewrites logical asset paths to the provided CDN prefix in browser-facing text", () => {
    const content = [
      '<img src="/assets/project/uploads/logo.png" alt="Logo">',
      "background-image: url(/assets/project/uploads/bg.png);",
      '{"logo":"\\/assets\\/project\\/uploads\\/icon.png"}',
    ].join("\n");

    const rewritten = rewriteProjectAssetLogicalUrls(content, "https://s.example.com/project-assets/u/p/preview/1.0.0/files");

    expect(rewritten).toContain('src="https://s.example.com/project-assets/u/p/preview/1.0.0/files/uploads/logo.png"');
    expect(rewritten).toContain(
      "url(https://s.example.com/project-assets/u/p/preview/1.0.0/files/uploads/bg.png)",
    );
    expect(rewritten).toContain(
      '"https:\\/\\/s.example.com\\/project-assets\\/u\\/p\\/preview\\/1.0.0\\/files\\/uploads\\/icon.png"',
    );
  });

  it("leaves logical paths unchanged when no CDN prefix is available", () => {
    const content = '<img src="/assets/project/uploads/logo.png" alt="Logo">';

    expect(rewriteProjectAssetLogicalUrls(content, "")).toBe(content);
  });
});
