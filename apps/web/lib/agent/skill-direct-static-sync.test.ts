import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

describe("skill-native static sync", () => {
  it("keeps page html and staticSite html aligned and references shared assets", async () => {
    const result = await runSkillRuntimeExecutor({
      state: {
        messages: [
          new HumanMessage(
            "Generate LC-CNC 6-page site now. Required routes: / /company /products /news /cases /contact.",
          ),
        ],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        sitemap: ["/", "/company", "/products", "/news", "/cases", "/contact"],
      } as any,
      timeoutMs: 60_000,
    });

    const site = (result.state as any).site_artifacts;
    expect(result.phase).toBe("end");
    expect(site).toBeTruthy();

    const pages = site.pages || [];
    const staticFiles = site.staticSite?.files || [];
    const companyPage = pages.find((p: any) => p.path === "/company");
    const companyFile = staticFiles.find((f: any) => f.path === "/company/index.html");
    expect(String(companyPage?.html || "")).toContain("/styles.css");
    expect(String(companyPage?.html || "")).toContain("/script.js");
    expect(String(companyPage?.html || "").trim()).toBe(String(companyFile?.content || "").trim());
  });

  it("does not treat 24/7 as /7 route and keeps nav routes", async () => {
    const result = await runSkillRuntimeExecutor({
      state: {
        messages: [
          new HumanMessage(
            "Nav: Home | 3C Machines | Custom Solutions | Cases | About | Contact. Sub: 10-Day Prototype • 15-Day Delivery • 24/7 WhatsApp Support.",
          ),
        ],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    });

    const paths = ((result.state as any)?.site_artifacts?.pages || []).map((p: any) => String(p?.path || ""));
    expect(paths).not.toContain("/7");
    expect(paths).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
  });
});

