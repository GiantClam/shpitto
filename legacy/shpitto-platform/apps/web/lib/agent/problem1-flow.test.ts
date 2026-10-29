import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { Bundler } from "../bundler";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

const ROUTES = ["/", "/company", "/products", "/news", "/cases", "/contact"];

describe("problem1 flow", () => {
  it("generates a 6-page static site via skill-native executor", async () => {
    const outRoot = path.resolve(process.cwd(), ".tmp", "problem1-lc-cnc");
    const outSite = path.join(outRoot, "site");
    await fs.rm(outSite, { recursive: true, force: true });
    await fs.mkdir(outSite, { recursive: true });

    const result = await runSkillRuntimeExecutor({
      state: {
        messages: [
          new HumanMessage(
            [
              "为 LC-CNC 生成完整 6 页面静态站点。",
              "必须包含页面：/ /company /products /news /cases /contact。",
              "每页内容要丰富，导航可互相跳转。",
            ].join("\n"),
          ),
        ],
        phase: "conversation",
        sitemap: ROUTES,
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 120_000,
    });

    const project = (result.state as any).site_artifacts;
    expect(project).toBeTruthy();
    expect(result.phase).toBe("end");
    expect(project.pages.length).toBe(6);
    expect(project.pages.map((p: any) => p.path)).toEqual(ROUTES);

    const bundle = await Bundler.createBundle(project);
    for (const file of bundle.fileEntries) {
      const rel = file.path.replace(/^\/+/, "");
      const abs = path.join(outSite, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, file.content, "utf8");
    }

    const navChecks: Array<{ path: string; missing: string[] }> = [];
    for (const p of project.pages || []) {
      const rel = p.path === "/" ? "index.html" : `${p.path.replace(/^\//, "")}/index.html`;
      const abs = path.join(outSite, rel);
      const html = await fs.readFile(abs, "utf8");
      const missing = (project.pages || [])
        .map((x: any) => {
          const route = String(x.path || "/");
          return route === "/" ? ["/", "/index.html"] : [`${route}/`, `${route}/index.html`];
        })
        .filter((cands: string[]) => !cands.some((href) => html.includes(`href=\"${href}\"`)))
        .map((cands: string[]) => cands[0]);
      navChecks.push({ path: p.path, missing });
    }

    expect(navChecks.every((x) => x.missing.length === 0)).toBe(true);
    expect(JSON.stringify(project)).not.toContain("[object Object]");
  });
});

