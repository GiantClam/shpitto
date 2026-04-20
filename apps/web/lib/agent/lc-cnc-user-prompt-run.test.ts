import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { Bundler } from "../bundler";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

const prompt = `为灵创智能公司生成网站，工业风英文站，导航 Home | 3C Machines | Custom Solutions | Cases | About | Contact。`;

describe("lc-cnc user prompt runtime", () => {
  it(
    "runs skill-native executor and exports artifacts",
    async () => {
      const outRoot = path.resolve(process.cwd(), ".tmp", "lc-cnc-user-prompt-run");
      const outSite = path.join(outRoot, "site");
      await fs.rm(outRoot, { recursive: true, force: true });
      await fs.mkdir(outSite, { recursive: true });

      const summary = await runSkillRuntimeExecutor({
        state: {
          messages: [new HumanMessage({ content: prompt })],
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
        } as any,
        timeoutMs: 180_000,
      });

      const site = (summary.state as any).site_artifacts;
      expect(site).toBeTruthy();
      expect(site?.staticSite?.generation?.isComplete).toBe(true);

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
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.some((p: any) => p?.path === "/contact")).toBe(true);

      const report = {
        generatedAt: new Date().toISOString(),
        finalPhase: summary.phase,
        provider: String((summary.state as any)?.workflow_context?.lockedProvider || "unknown"),
        model: String((summary.state as any)?.workflow_context?.lockedModel || "unknown"),
        pageCount: pages.length,
      };
      await fs.writeFile(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
      console.log("LC_CNC_USER_PROMPT_REPORT=" + JSON.stringify(report));
    },
    Math.max(600_000, Number(process.env.REAL_SKILL_TEST_TIMEOUT_MS || 1_800_000)),
  );
});

