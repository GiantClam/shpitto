import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPreviewDeviceUrl, sanitizePreviewFrameScreenTarget } from "./preview-frame";

const FRAME_FILES = [
  "browser-chrome.html",
  "macbook.html",
  "ipad-pro.html",
  "iphone-15-pro.html",
  "android-pixel.html",
];

describe("preview-frame", () => {
  it("keeps same-origin preview targets and normalizes them to path-only urls", () => {
    expect(
      sanitizePreviewFrameScreenTarget(
        "https://app.test/api/chat/tasks/1/preview/index.html?refresh=2#viewport",
        "https://app.test",
      ),
    ).toBe("/api/chat/tasks/1/preview/index.html?refresh=2#viewport");

    expect(
      sanitizePreviewFrameScreenTarget("/api/chat/tasks/1/preview/index.html?refresh=2#viewport", "https://app.test"),
    ).toBe("/api/chat/tasks/1/preview/index.html?refresh=2#viewport");
  });

  it("blocks cross-origin and unsafe preview targets", () => {
    expect(sanitizePreviewFrameScreenTarget("https://evil.test/preview", "https://app.test")).toBe("");
    expect(sanitizePreviewFrameScreenTarget("javascript:alert(1)", "https://app.test")).toBe("");
    expect(sanitizePreviewFrameScreenTarget("data:text/html,hi", "https://app.test")).toBe("");
  });

  it("wraps safe targets in a device frame shell", () => {
    expect(
      buildPreviewDeviceUrl(
        "https://app.test/api/chat/tasks/1/preview/index.html?refresh=2#viewport",
        { frame: "browser-chrome.html" },
        "preview.example",
        "https://app.test",
      ),
    ).toBe(
      "/frames/browser-chrome.html?screen=%2Fapi%2Fchat%2Ftasks%2F1%2Fpreview%2Findex.html%3Frefresh%3D2%23viewport&url=preview.example",
    );
  });

  it("falls back to the raw preview url when no frame is requested or the target is unsafe", () => {
    const previewUrl = "https://app.test/api/chat/tasks/1/preview/index.html";

    expect(buildPreviewDeviceUrl(previewUrl, undefined, "preview.example", "https://app.test")).toBe(previewUrl);
    expect(
      buildPreviewDeviceUrl(
        "https://evil.test/api/chat/tasks/1/preview/index.html",
        { frame: "browser-chrome.html" },
        "preview.example",
        "https://app.test",
      ),
    ).toBe("https://evil.test/api/chat/tasks/1/preview/index.html");
  });

  it("ships the same same-origin guard in every preview shell", async () => {
    for (const frameFile of FRAME_FILES) {
      const html = await readFile(path.join(process.cwd(), "public", "frames", frameFile), "utf8");
      expect(html).toContain("resolved.origin !== location.origin");
      expect(html).toContain("Blocked preview target.");
    }
  });
});
