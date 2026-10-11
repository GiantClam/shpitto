import { describe, expect, it } from "vitest";
import { Bundler } from "./bundler";

describe("Bundler.createBundle (skill-direct only)", () => {
  it("passes through static files and builds manifest", async () => {
    const bundle = await Bundler.createBundle({
      staticSite: {
        mode: "skill-direct",
        files: [
          { path: "/styles.css", content: "body{margin:0}", type: "text/css" },
          { path: "/index.html", content: "<!doctype html><html><body><h1>LC-CNC</h1></body></html>", type: "text/html" },
          { path: "/contact/index.html", content: "<!doctype html><html><body><form></form></body></html>", type: "text/html" },
        ],
      },
    });

    expect(bundle.fileEntries).toHaveLength(3);
    expect(bundle.manifest["/styles.css"]).toBeTypeOf("string");
    expect(bundle.manifest["/index.html"]).toBeTypeOf("string");
    expect(bundle.manifest["/contact/index.html"]).toBeTypeOf("string");
    expect(bundle.fileEntries.find((f) => f.path === "/index.html")?.content).toContain("LC-CNC");
  });

  it("normalizes file path and deduplicates by latest path", async () => {
    const bundle = await Bundler.createBundle({
      staticSite: {
        mode: "skill-direct",
        files: [
          { path: "index.html", content: "old" },
          { path: "/index.html", content: "new" },
          { path: "assets\\logo.svg", content: "<svg></svg>" },
        ],
      },
    });

    expect(bundle.fileEntries).toHaveLength(2);
    expect(bundle.fileEntries.find((f) => f.path === "/index.html")?.content).toBe("new");
    expect(bundle.fileEntries.find((f) => f.path === "/assets/logo.svg")?.type).toBe("image/svg+xml");
  });

  it("fails when not skill-direct static files", async () => {
    await expect(
      Bundler.createBundle({
        pages: [{ path: "/", html: "<h1>x</h1>" }],
      }),
    ).rejects.toThrow("Bundler only supports skill-direct staticSite.files");
  });
});
