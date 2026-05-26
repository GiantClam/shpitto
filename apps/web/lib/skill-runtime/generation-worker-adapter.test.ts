import { describe, expect, it } from "vitest";

import { createStaticGenerationWorkerAdapter } from "./generation-worker-adapter";

describe("generation-worker-adapter", () => {
  it("defines a bounded internal adapter surface for route-unit execution", async () => {
    const adapter = createStaticGenerationWorkerAdapter({
      id: "shpitto-tool-skill-runtime",
      capabilities: ["route-unit", "route-unit", "html"],
      runUnit: async (input) => ({
        unitId: input.unitId,
        status: "passed",
        files: [{ path: "/index.html", content: "<!doctype html><html><body></body></html>", type: "text/html" }],
        summary: `generated ${input.targetFiles.join(", ")}`,
      }),
    });

    const result = await adapter.runUnit({
      unitId: "homepage",
      route: "/",
      targetFiles: ["/index.html"],
      prompt: "Generate the homepage.",
      context: { websiteSurfaceMode: "docs-knowledge-site" },
    });

    expect(adapter.capabilities).toEqual(["route-unit", "html"]);
    expect(result.status).toBe("passed");
    expect(result.summary).toContain("/index.html");
  });
});
