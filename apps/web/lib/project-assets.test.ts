import { describe, expect, it } from "vitest";
import {
  extractProjectAssetPreviewScopeFromContent,
  repairBrokenProjectAssetDirectoryUrls,
  rewriteProjectAssetLogicalUrls,
  rewriteProjectAssetLogicalUrlsWithAssetMap,
  rewriteProjectAssetLogicalUrlsForRelease,
  toProjectAssetLogicalPath,
} from "./project-assets";

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

  it("repairs generated CDN directory URLs that dropped the asset filename", () => {
    const prefix = "https://s.example.com/project-assets/u/p/preview/1.0.3/files";
    const content = [
      `<img class="brand__logo" src="${prefix}/uploads/" alt="Logo">`,
      `.logo{background-image:url(${prefix}/uploads/)}`,
    ].join("\n");

    const repaired = repairBrokenProjectAssetDirectoryUrls(content, prefix, [
      {
        category: "image",
        path: "uploads/shpitto-logo-mark-64.png",
        name: "shpitto-logo-mark-64.png",
        updatedAt: 20,
        previewUrl: "",
        releaseUrl: "",
        url: "",
      },
      {
        category: "document",
        path: "uploads/CASUX_.md.pdf",
        name: "CASUX_.md.pdf",
        updatedAt: 30,
        previewUrl: "",
        releaseUrl: "",
        url: "",
      },
    ]);

    expect(repaired).toContain(`src="${prefix}/uploads/shpitto-logo-mark-64.png"`);
    expect(repaired).toContain(`url(${prefix}/uploads/shpitto-logo-mark-64.png)`);
  });

  it("repairs stale preview directory URLs even when the current prefix changed", () => {
    const stalePrefix = "https://s.example.com/project-assets/u/p/preview/1.0.2/files";
    const currentPrefix = "https://s.example.com/project-assets/u/p/preview/1.0.4/files";
    const content = `<img class="brand__logo" src="${stalePrefix}/uploads/" alt="Logo">`;

    const repaired = repairBrokenProjectAssetDirectoryUrls(content, currentPrefix, [
      {
        category: "image",
        path: "uploads/shpitto-logo-mark-64.png",
        name: "shpitto-logo-mark-64.png",
        updatedAt: 20,
        previewUrl: `${stalePrefix}/uploads/shpitto-logo-mark-64.png`,
        releaseUrl: "https://s.example.com/project-assets/u/p/release/current/files/uploads/shpitto-logo-mark-64.png",
        url: "",
      },
    ]);

    expect(repaired).toContain(`src="${stalePrefix}/uploads/shpitto-logo-mark-64.png"`);
  });

  it("can prefer release URLs when repairing deploy output", () => {
    const stalePrefix = "https://s.example.com/project-assets/u/p/preview/1.0.2/files";
    const releaseUrl = "https://s.example.com/project-assets/u/p/release/current/files/uploads/logo.png";
    const content = `<img class="brand__logo" src="${stalePrefix}/uploads/" alt="Logo">`;

    const repaired = repairBrokenProjectAssetDirectoryUrls(
      content,
      "https://s.example.com/project-assets/u/p/release/current/files",
      [
        {
          category: "image",
          path: "uploads/logo.png",
          name: "logo.png",
          updatedAt: 20,
          previewUrl: `${stalePrefix}/uploads/logo.png`,
          releaseUrl,
          url: "",
        },
      ],
      { prefer: "release" },
    );

    expect(repaired).toContain(`src="${releaseUrl}"`);
  });

  it("uses per-asset preview URLs when logical paths point to older uploaded asset versions", () => {
    const content = '<img src="/assets/project/uploads/logo.png" alt="Logo">';

    const rewritten = rewriteProjectAssetLogicalUrlsWithAssetMap(
      content,
      "https://s.example.com/project-assets/u/p/preview/1.0.3/files",
      [
        {
          path: "uploads/logo.png",
          previewUrl: "https://s.example.com/project-assets/u/p/preview/1.0.2/files/uploads/logo.png",
          url: "",
        },
      ],
    );

    expect(rewritten).toContain(
      'src="https://s.example.com/project-assets/u/p/preview/1.0.2/files/uploads/logo.png"',
    );
  });

  it("rewrites branding logo references to the released asset URL", () => {
    const releaseUrl = "https://s.example.com/project-assets/u/p/release/current/files/uploads/logo.png";
    const project = {
      branding: {
        logo: "/assets/project/uploads/logo.png",
      },
      site_config: {
        branding: {
          logo: "/assets/project/uploads/logo.png",
        },
      },
      staticSite: {
        files: [],
      },
    };

    const rewritten = rewriteProjectAssetLogicalUrlsForRelease(
      project,
      { ownerUserId: "u", projectId: "p" },
      [
        {
          path: "uploads/logo.png",
          releaseUrl,
          previewUrl: "",
          url: "",
          category: "image",
          updatedAt: 20,
          name: "logo.png",
        },
      ],
    );

    expect(rewritten.branding.logo).toBe(releaseUrl);
    expect(rewritten.site_config.branding.logo).toBe(releaseUrl);
  });

  it("rewrites direct preview asset URLs to release URLs during publish", () => {
    const previewUrl = "https://s.example.com/project-assets/u/p/preview/1.0.2/files/uploads/logo.png";
    const releaseUrl = "https://s.example.com/project-assets/u/p/release/current/files/uploads/logo.png";
    const project = {
      staticSite: {
        files: [
          {
            path: "/index.html",
            content: `<img class="brand__logo" src="${previewUrl}" alt="Logo">`,
          },
          {
            path: "/data.json",
            content: `{"logo":"${previewUrl.replace(/\//g, "\\/")}"}`,
          },
        ],
      },
    };

    const rewritten = rewriteProjectAssetLogicalUrlsForRelease(
      project,
      { ownerUserId: "u", projectId: "p" },
      [
        {
          path: "uploads/logo.png",
          releaseUrl,
          previewUrl,
          url: previewUrl,
          category: "image",
          updatedAt: 20,
          name: "logo.png",
        },
      ],
    );

    expect(rewritten.staticSite.files[0].content).toContain(`src="${releaseUrl}"`);
    expect(rewritten.staticSite.files[1].content).toContain(releaseUrl.replace(/\//g, "\\/"));
    expect(rewritten.staticSite.files[0].content).not.toContain("/preview/");
  });

  it("extracts project asset preview scope from rendered content", () => {
    const scope = extractProjectAssetPreviewScopeFromContent(
      '<img src="https://s.example.com/project-assets/user-1/chat-1/preview/1.0.2/files/uploads/">',
    );

    expect(scope).toEqual({
      ownerUserId: "user-1",
      projectId: "chat-1",
      cdnPrefix: "https://s.example.com/project-assets/user-1/chat-1/preview/1.0.2/files",
    });
  });
});
