import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { Bundler } from "../bundler";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

function extractHeroTitle(rawHtml: string): string | null {
  const match = String(rawHtml || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match?.[1]?.replace(/<[^>]+>/g, "").trim() || null;
}

describe("problem1 real aiberm flow", () => {
  it("generates LC-CNC site with skill-native runtime (no graph inline generation)", async () => {
    const outRoot = path.resolve(process.cwd(), ".tmp", "problem1-real-aiberm");
    const outSite = path.join(outRoot, "site");
    await fs.rm(outSite, { recursive: true, force: true });
    await fs.mkdir(outSite, { recursive: true });

    const prompt = [
      "为 LC-CNC 生成完整 6 页面静态站点。",
      "行业：CNC 数控设备制造。",
      "必须包含页面：/ /company /products /news /cases /contact。",
      "要求：每页内容显著不同、导航可互跳、信息要丰富。",
    ].join("\n");

    const summary = await runSkillRuntimeExecutor({
      state: {
        messages: [new HumanMessage({ content: prompt })],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        sitemap: ["/", "/company", "/products", "/news", "/cases", "/contact"],
      } as any,
      timeoutMs: 300_000,
    });

    const project = (summary.state as any).site_artifacts;
    expect(project).toBeTruthy();
    await fs.writeFile(path.join(outRoot, "project.json"), JSON.stringify(project, null, 2), "utf8");

    const bundle = await Bundler.createBundle(project);
    for (const file of bundle.fileEntries) {
      const rel = file.path.replace(/^\/+/, "");
      const abs = path.join(outSite, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, file.content, "utf8");
    }

    const pages = project.pages || [];
    const heroTitles = pages.map((p: any) => extractHeroTitle(String(p?.html || ""))).filter(Boolean);
    expect(pages.length).toBeGreaterThanOrEqual(6);
    expect(new Set(heroTitles).size).toBeGreaterThan(1);
  }, 900000);
});

