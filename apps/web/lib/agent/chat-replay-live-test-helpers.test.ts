import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  captureMobilePreviewScreenshots,
  routeToHtmlPath,
  normalizeRoute,
} from "./chat-replay-live-test-helpers";

describe("chat replay live test helpers", () => {
  it("normalizes routes and converts them to html paths", () => {
    expect(normalizeRoute("blog/")).toBe("/blog");
    expect(routeToHtmlPath("/")).toBe("/index.html");
    expect(routeToHtmlPath("/blog")).toBe("/blog/index.html");
  });

  it("skips screenshot qa cleanly when preview url is missing", async () => {
    const result = await captureMobilePreviewScreenshots({
      previewUrl: "",
      outputDir: path.resolve(process.cwd(), ".tmp", "qa-screenshots", "missing-url"),
    });

    expect(result.executed).toBe(false);
    expect(result.artifacts).toEqual([]);
    expect(result.skippedReason).toMatch(/missing preview url/i);
  });
});
