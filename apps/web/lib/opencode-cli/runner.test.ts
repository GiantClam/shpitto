import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildOpenCodeWebsitePrompt, runOpenCodeCli } from "./runner";

const ENV_KEYS = [
  "XDG_DATA_HOME",
  "SHPITTO_OPENCODE_AUTH_JSON",
  "SHPITTO_OPENCODE_ISOLATE_DATA_HOME",
  "SHPITTO_OPENCODE_PRESERVE_DATA_HOME",
] as const;

const ENV_SNAPSHOT = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ENV_SNAPSHOT[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("opencode runner", () => {
  const request = {
    skillId: "build-marketing-site",
    taskClass: "baseline_generation" as const,
    projectRoot: "D:/tmp/shpitto-opencode-job",
    userIntentSummary: "Generate a launch-ready marketing site with home and pricing routes.",
    executionScope: "full-baseline",
    successCriteria: ["all required routes exist", "output remains deployable"],
    structuredInputs: {
      companyName: "Northstar",
      targetAudience: ["founders", "operators"],
      primaryGoal: ["launch-ready website baseline"],
      locale: "en",
      routes: ["/", "/pricing"],
    },
    templateContext: {
      templateId: "marketing-landing-site",
      siteType: "marketing-landing-site",
      templateFamily: "marketing-launch",
      foundations: [],
      seeds: [],
    },
  };

  it("builds a prompt that points OpenCode at the .shpitto contract bundle", () => {
    const prompt = buildOpenCodeWebsitePrompt(request);
    expect(prompt).toContain(".shpitto/request.json");
    expect(prompt).toContain("- /pricing");
    expect(prompt).toContain("Keep the project on Next.js App Router.");
  });

  it("parses json events and updated file paths from the runner output", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = await runOpenCodeCli({
      request,
      workspaceRoot: request.projectRoot,
      commandRunner: async (command, args) => {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stdout: [
            JSON.stringify({ type: "file", path: "app/page.tsx" }),
            JSON.stringify({ type: "note", updatedFiles: ["components/site-shell.tsx"] }),
          ].join("\n"),
          stderr: "",
        };
      },
    });

    expect(calls[0]?.args).toEqual(expect.arrayContaining(["run", "--format", "json", "--dir", request.projectRoot]));
    expect(result.status).toBe("completed");
    expect(result.updatedFiles).toEqual(["/app/page.tsx", "/components/site-shell.tsx"]);
  });

  it("seeds auth.json into an isolated XDG_DATA_HOME by default and cleans it up afterwards", async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-opencode-auth-source-"));
    const sourceXdgDataHome = path.join(sourceRoot, "xdg-data");
    const sourceAuthJson = path.join(sourceXdgDataHome, "opencode", "auth.json");
    await fs.mkdir(path.dirname(sourceAuthJson), { recursive: true });
    await fs.writeFile(sourceAuthJson, '{"provider":"test"}', "utf8");

    process.env.XDG_DATA_HOME = sourceXdgDataHome;
    delete process.env.SHPITTO_OPENCODE_ISOLATE_DATA_HOME;
    delete process.env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME;

    let isolatedXdgDataHome = "";
    let seededAuthJson = "";
    const result = await runOpenCodeCli({
      request,
      workspaceRoot: request.projectRoot,
      commandRunner: async (_command, _args, options) => {
        isolatedXdgDataHome = String(options.env?.XDG_DATA_HOME || "");
        const isolatedAuthJson = path.join(isolatedXdgDataHome, "opencode", "auth.json");
        seededAuthJson = await fs.readFile(isolatedAuthJson, "utf8");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(result.status).toBe("completed");
    expect(isolatedXdgDataHome).toBeTruthy();
    expect(isolatedXdgDataHome).not.toBe(sourceXdgDataHome);
    expect(seededAuthJson).toBe('{"provider":"test"}');
    await expect(fs.access(isolatedXdgDataHome)).rejects.toThrow();
    await fs.rm(sourceRoot, { recursive: true, force: true });
  });

  it("can opt out of XDG isolation for debugging", async () => {
    process.env.XDG_DATA_HOME = "D:/tmp/source-xdg";
    process.env.SHPITTO_OPENCODE_ISOLATE_DATA_HOME = "0";

    let forwardedXdgDataHome = "";
    await runOpenCodeCli({
      request,
      workspaceRoot: request.projectRoot,
      commandRunner: async (_command, _args, options) => {
        forwardedXdgDataHome = String(options.env?.XDG_DATA_HOME || "");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(forwardedXdgDataHome).toBe("D:/tmp/source-xdg");
  });

  it("surfaces runner timeout failures instead of hanging the task", async () => {
    const result = await runOpenCodeCli({
      request,
      workspaceRoot: request.projectRoot,
      commandRunner: async () => {
        throw new Error("OpenCode CLI timed out after 1234ms.");
      },
    });

    expect(result.status).toBe("failed");
    expect(String(result.failureReason || "")).toContain("timed out");
    expect(result.summary).toContain("OpenCode CLI invocation failed");
  });
});
