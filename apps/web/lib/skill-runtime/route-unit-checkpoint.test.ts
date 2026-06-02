import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  readAllRouteUnitVerificationCheckpoints,
  recoverGeneratedProjectCheckpoint,
  readRouteUnitInputCheckpoint,
  readRouteUnitVerificationCheckpoint,
  writeRouteUnitInputCheckpoint,
  writeRouteUnitVerificationCheckpoint,
} from "./route-unit-checkpoint.ts";

describe("route unit checkpoint", () => {
  it("reads route-unit input and verification checkpoints by route", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-checkpoint-read");
    await fs.rm(checkpointDir, { recursive: true, force: true });

    await writeRouteUnitInputCheckpoint(checkpointDir, "/research-center", {
      unitId: "route-research-center",
      route: "/research-center",
      targetFiles: ["/research-center/index.html", "/styles.css", "/script.js"],
      prompt: "Generate the /research-center route unit.",
      context: { contractHash: "a".repeat(64) },
    });
    await writeRouteUnitVerificationCheckpoint(checkpointDir, {
      route: "/research-center",
      htmlPath: "/research-center/index.html",
      status: "passed",
      checkedFiles: ["/research-center/index.html", "/styles.css", "/script.js"],
      issues: [],
      violatedFields: [],
      evidence: [],
    });

    const input = await readRouteUnitInputCheckpoint(checkpointDir, "/research-center");
    const verification = await readRouteUnitVerificationCheckpoint(checkpointDir, "/research-center");

    expect(input).toMatchObject({
      unitId: "route-research-center",
      route: "/research-center",
    });
    expect(verification).toMatchObject({
      route: "/research-center",
      status: "passed",
    });
  });

  it("collects all route verification checkpoints for a contract route set", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-checkpoint-collect");
    await fs.rm(checkpointDir, { recursive: true, force: true });

    await writeRouteUnitVerificationCheckpoint(checkpointDir, {
      route: "/",
      htmlPath: "/index.html",
      status: "passed",
      checkedFiles: ["/index.html", "/styles.css", "/script.js"],
      issues: [],
      violatedFields: [],
      evidence: [],
    });
    await writeRouteUnitVerificationCheckpoint(checkpointDir, {
      route: "/research-center",
      htmlPath: "/research-center/index.html",
      status: "passed",
      checkedFiles: ["/research-center/index.html", "/styles.css", "/script.js"],
      issues: [],
      violatedFields: [],
      evidence: [],
    });

    const records = await readAllRouteUnitVerificationCheckpoints(checkpointDir, ["/", "/research-center"]);
    expect(records.map((record) => record.route)).toEqual(["/", "/research-center"]);
  });

  it("recovers a generated project from flat step snapshots when the final project checkpoint is missing", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-checkpoint-recover-flat");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    await fs.mkdir(checkpointDir, { recursive: true });

    await fs.writeFile(
      path.join(checkpointDir, "06-index.html.json"),
      JSON.stringify(
        {
          stepKey: "/index.html",
          files: [
            { path: "/index.html", content: "<!doctype html><html><body><h1>CASUX</h1></body></html>", type: "text/html" },
            { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
            { path: "/script.js", content: "console.log('ready')", type: "application/javascript" },
          ],
          pages: [{ path: "/", html: "<!doctype html><html><body><h1>CASUX</h1></body></html>" }],
        },
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(
      path.join(checkpointDir, "07-research.html.json"),
      JSON.stringify(
        {
          stepKey: "/research-center/index.html",
          files: [
            {
              path: "/research-center/index.html",
              content: "<!doctype html><html><body><h1>Research Center</h1></body></html>",
              type: "text/html",
            },
          ],
          pages: [{ path: "/research-center", html: "<!doctype html><html><body><h1>Research Center</h1></body></html>" }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const recovered = await recoverGeneratedProjectCheckpoint(checkpointDir);
    expect(Array.isArray(recovered?.staticSite?.files)).toBe(true);
    expect(recovered?.staticSite?.files.map((file: any) => file.path)).toEqual(
      expect.arrayContaining(["/index.html", "/research-center/index.html", "/styles.css", "/script.js"]),
    );
    expect(recovered?.pages.map((page: any) => page.path)).toEqual(expect.arrayContaining(["/", "/research-center"]));
  });

  it("recovers a generated project from checkpoint site materialization when present", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-checkpoint-recover-site");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    await fs.mkdir(path.join(checkpointDir, "site", "research-center"), { recursive: true });

    await fs.writeFile(
      path.join(checkpointDir, "site", "index.html"),
      "<!doctype html><html><body><h1>CASUX</h1></body></html>",
      "utf8",
    );
    await fs.writeFile(path.join(checkpointDir, "site", "styles.css"), "body{font-family:system-ui}", "utf8");
    await fs.writeFile(path.join(checkpointDir, "site", "script.js"), "console.log('ready')", "utf8");
    await fs.writeFile(
      path.join(checkpointDir, "site", "research-center", "index.html"),
      "<!doctype html><html><body><h1>Research Center</h1></body></html>",
      "utf8",
    );

    const recovered = await recoverGeneratedProjectCheckpoint(checkpointDir);
    expect(recovered?.staticSite?.files.map((file: any) => file.path)).toEqual(
      expect.arrayContaining(["/index.html", "/research-center/index.html", "/styles.css", "/script.js"]),
    );
    expect(recovered?.pages.map((page: any) => page.path)).toEqual(expect.arrayContaining(["/", "/research-center"]));
  });
});
