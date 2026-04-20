import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "./graph";
import { Bundler } from "../bundler";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

const prompt = `Generate a complete industrial English website for LC-CNC.
Required routes: /, /3c-machines, /custom-solutions, /cases, /about, /contact.`;

describe("lc-cnc user-request mainflow", () => {
  it("runs skill-native executor and exports static site", async () => {
    const outRoot = path.resolve(process.cwd(), ".tmp", "lc-cnc-user-mainflow");
    const outSite = path.join(outRoot, "site");
    await fs.rm(outRoot, { recursive: true, force: true });
    await fs.mkdir(outSite, { recursive: true });

    const input: AgentState = {
      messages: [new HumanMessage({ content: prompt })],
      phase: "conversation",
      current_page_index: 0,
      attempt_count: 0,
      sitemap: ["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"],
    } as any;

    const summary = await runSkillRuntimeExecutor({
      state: input,
      timeoutMs: Math.max(120_000, Number(process.env.REAL_SKILL_TIMEOUT_MS || 900_000)),
    });

    const state = summary.state as AgentState;
    const site = (state as any).site_artifacts;
    expect(site).toBeTruthy();

    const project = site as any;
    await fs.writeFile(path.join(outRoot, "project.json"), JSON.stringify(project, null, 2), "utf8");

    const bundle = await Bundler.createBundle(project);
    for (const file of bundle.fileEntries) {
      const rel = file.path.replace(/^\/+/, "");
      const abs = path.join(outSite, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, file.content, "utf8");
    }

    const pages = Array.isArray(project.pages) ? project.pages : [];
    const report = {
      generatedAt: new Date().toISOString(),
      finalPhase: state.phase,
      pageCount: pages.length,
      provider: String((state as any)?.workflow_context?.lockedProvider || "unknown"),
      model: String((state as any)?.workflow_context?.lockedModel || "unknown"),
      routes: pages.map((p: any) => p?.path),
      output: {
        projectJson: path.join(outRoot, "project.json"),
        siteDir: outSite,
      },
    };

    await fs.writeFile(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
    console.log("LC_CNC_USER_MAINFLOW_REPORT=" + JSON.stringify(report));
  }, 1200000);
});

