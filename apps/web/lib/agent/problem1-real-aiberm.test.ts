import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { graph, getProviderTraceSnapshot, resetProviderTrace, type AgentState } from "./graph";
import { Bundler } from "../bundler";

function extractHeroTitleFromRawHtml(rawHtml: string): string | null {
  const match = (rawHtml || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match?.[1]) return null;
  const text = match[1].replace(/<[^>]+>/g, "").trim();
  return text || null;
}

function buildConfirmMessage(round: number) {
  if (round === 0) return "方案确认，立即开始生成整站预览。";
  if (round === 1) return "请直接执行网站生成主流程，不要再提问。";
  return "继续生成，直到得到完整 6 页面 project_json。";
}

describe("problem1 real aiberm flow", () => {
  it("generates LC-CNC 6-page site with real provider (no mock)", async () => {
    const outRoot = path.resolve(process.cwd(), ".tmp", "problem1-real-aiberm");
    const outSite = path.join(outRoot, "site");
    await fs.rm(outSite, { recursive: true, force: true });
    await fs.mkdir(outSite, { recursive: true });
    resetProviderTrace();

    const prompt = [
      "为 LC-CNC 生成完整 6 页面静态站点。",
      "行业：CNC 数控设备制造。",
      "目标用户：工厂采购、设备工程师、工艺负责人。",
      "视觉风格：工业科技、专业可信、深色+橙色点缀。",
      "必须包含页面：/ /company /products /news /cases /contact。",
      "要求：每页内容显著不同、导航可互跳、信息要丰富。",
      "请先给方案，我确认后你直接执行生成流程。",
    ].join("\n");

    let state: AgentState = {
      messages: [new HumanMessage({ content: prompt })],
      phase: "conversation",
      current_page_index: 0,
      attempt_count: 0,
    };

    state = (await graph.invoke(state)) as AgentState;

    for (let i = 0; i < 3; i += 1) {
      if (state.project_json) break;
      state = (await graph.invoke({
        ...state,
        messages: [...(state.messages || []), new HumanMessage({ content: buildConfirmMessage(i) })],
      })) as AgentState;
    }

    expect(state.project_json).toBeTruthy();
    const project = state.project_json;

    await fs.writeFile(path.join(outRoot, "project.json"), JSON.stringify(project, null, 2), "utf8");

    const bundle = await Bundler.createBundle(project);
    for (const file of bundle.fileEntries) {
      const rel = file.path.replace(/^\/+/, "");
      const abs = path.join(outSite, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, file.content, "utf8");
    }

    const pages = project.pages || [];
    const heroTitles = pages
      .map((p: any) => extractHeroTitleFromRawHtml(String(p?.puckData?.root?.props?.rawHtml || "")))
      .filter(Boolean);

    const navChecks: Array<{ path: string; missingNavLinks: string[] }> = [];
    for (const p of pages) {
      const rel = p.path === "/" ? "index.html" : `${p.path.replace(/^\//, "")}/index.html`;
      const abs = path.join(outSite, rel);
      const html = await fs.readFile(abs, "utf8");
      const missing = pages
        .map((x: any) => (x.path === "/" ? "/index.html" : `/${x.path.replace(/^\//, "")}/index.html`))
        .filter((href: string) => !html.includes(`href=\"${href}\"`));
      navChecks.push({ path: p.path, missingNavLinks: missing });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      provider: "unknown",
      model: "unknown",
      finalPhase: state.phase,
      pageCount: pages.length,
      uniqueHeroCount: new Set(heroTitles).size,
      pages: pages.map((p: any) => ({
        path: p.path,
        seoTitle: p?.seo?.title,
        rawHtmlLength: String(p?.puckData?.root?.props?.rawHtml || "").length,
        heroTitle: extractHeroTitleFromRawHtml(String(p?.puckData?.root?.props?.rawHtml || "")),
      })),
      navChecks,
      output: {
        projectJson: path.join(outRoot, "project.json"),
        siteDir: outSite,
      },
    };

    const providerTrace = getProviderTraceSnapshot();
    const providerCounts = providerTrace.reduce<Record<string, number>>((acc, item) => {
      acc[item.provider] = (acc[item.provider] || 0) + 1;
      return acc;
    }, {});
    const lastHit = providerTrace[providerTrace.length - 1];
    report.provider = lastHit?.provider || "unknown";
    report.model = lastHit?.modelName || "unknown";
    (report as any).providerTrace = providerTrace;
    (report as any).providerCounts = providerCounts;

    await fs.writeFile(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");

    expect(pages.length).toBeGreaterThanOrEqual(6);
    expect(new Set(heroTitles).size).toBeGreaterThan(1);
    expect(navChecks.every((x) => x.missingNavLinks.length === 0)).toBe(true);

    console.log("REAL_AIBERM_REPORT=" + JSON.stringify(report));
  }, 1800000);
});
