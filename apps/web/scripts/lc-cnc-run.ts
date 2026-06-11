/**
 * LC-CNC website generation runner
 * Runs outside vitest so NODE_ENV != "test" and LLM is actually called
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HumanMessage } from "@langchain/core/messages";
import { Bundler } from "../lib/bundler.ts";
import { runSkillRuntimeExecutor } from "../lib/skill-runtime/executor.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prompt = `为灵创智能公司生成网站，灵创智能是做数控机床产品的工厂，网站的工业风与产品展示逻辑英文网站

【Header】
Logo：LC-CNC™
Nav：Home | 3C Machines | Custom Solutions | Cases | About | Contact

【Hero Section】
Title：Precision 3C CNC Machines for Southeast Asia
Sub：10-Day Prototype • 15-Day Delivery • 24/7 WhatsApp Support
CTA：Get Quote on WhatsApp | Request Catalog

【Product Grid】（工业风灰白背景，高对比度）
- 3C Phone-Frame Center
- 3C Laptop-Shell Center
- 3C Camera-Bezel Center
- 3C Keypad Center
（每个卡片：① 主图 ② 核心参数 ③ 一键WhatsApp浮标）

【Features Strip】
Fast Customization → 10-Day Sample
Short Lead-Time → 15-Day Shipment
Local Support → WhatsApp + Regional Agent

【Case Slider】
Phone Display Frame Machining | Laptop Shell Machining | Camera Bezel Machining | Phone Keypad Machining

【About】
LC-CNC, Shenzhen since 2013
ISO-certified plant, 30+ R&D engineers, 200+ installed across SEA.

【Certification】
ISO 9001, CE, SGS

【Contact & Capture】
Left：WhatsApp Chat (floating)
Right：Quick Quote Form
Fields：Name • Company • Email • WhatsApp • Machine Model • Quantity • Deadline
Consent：I agree to receive follow-up via WhatsApp.

【Footer】
Products | Support | Privacy | Sitemap
WhatsApp：+86-158-1370-3777
Email：sales@lc-cnc.com
Address：Bao'an, Shenzhen, China
Copyright © 2024 LC-CNC. All rights reserved.`;

async function main() {
  const outRoot = path.resolve(process.cwd(), ".tmp", "lc-cnc-real-run");
  const outSite = path.join(outRoot, "site");
  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.mkdir(outSite, { recursive: true });

  console.log("[lc-cnc-run] Starting generation, NODE_ENV =", process.env.NODE_ENV);
  console.log("[lc-cnc-run] Provider:", process.env.LLM_PROVIDER || "aiberm");

  const timeoutMs = Math.max(600_000, Number(process.env.REAL_SKILL_TIMEOUT_MS || 1_200_000));

  const summary = await runSkillRuntimeExecutor({
    state: {
      messages: [new HumanMessage({ content: prompt })],
      phase: "conversation",
      current_page_index: 0,
      attempt_count: 0,
    } as any,
    timeoutMs,
    onStep: async (snapshot) => {
      console.log(`[step ${snapshot.stepIndex}/${snapshot.totalSteps}] ${snapshot.stepKey} — ${snapshot.status}`);
    },
  });

  const site = (summary.state as any).site_artifacts;
  const project = site as any;

  if (project) {
    await fs.writeFile(path.join(outRoot, "project.json"), JSON.stringify(project, null, 2), "utf8");

    try {
      const bundle = await Bundler.createBundle(project);
      for (const file of bundle.fileEntries) {
        const rel = file.path.replace(/^\/+/, "");
        const abs = path.join(outSite, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, file.content, "utf8");
      }
      console.log("[lc-cnc-run] Bundle written to", outSite);
    } catch (e) {
      console.warn("[lc-cnc-run] Bundle failed:", e);
    }
  }

  const pages = Array.isArray(project?.pages) ? project.pages : [];
  const report = {
    generatedAt: new Date().toISOString(),
    finalPhase: summary.phase,
    provider: String((summary.state as any)?.workflow_context?.lockedProvider || "unknown"),
    model: String((summary.state as any)?.workflow_context?.lockedModel || "unknown"),
    pageCount: pages.length,
    routes: pages.map((p: any) => p?.path),
    output: { projectJson: path.join(outRoot, "project.json"), siteDir: outSite },
  };

  await fs.writeFile(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log("[lc-cnc-run] DONE:", JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("[lc-cnc-run] FAILED:", err);
  process.exit(1);
});
