import { describe, expect, it } from "vitest";
import { buildLocalePlan } from "./locale-plan.ts";

describe("buildLocalePlan", () => {
  it("classifies Chinese bilingual institution prompts as bilingual with a Chinese default", () => {
    const plan = buildLocalePlan("做一个中英双语机构网站，默认中文，并且需要语言切换。", "zh-CN");

    expect(plan.mode).toBe("bilingual");
    expect(plan.translationDriven).toBe(false);
    expect(plan.defaultLocale).toBe("zh-CN");
    expect(plan.locales).toEqual(["zh-CN", "en"]);
  });

  it("keeps Chinese-first bilingual prompts out of multilingual mode when incidental prose contains 'it'", () => {
    const prompt = [
      "# Canonical Website Generation Prompt",
      "",
      "- Language: Chinese-first bilingual Chinese and English",
      "- Keep one locale visible at a time. Chinese is the default visible language for the first render on every route.",
      "- If bilingual support is implemented with data attributes or resource files, do not duplicate both languages visibly in the same section.",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify(
        {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          websiteSurfaceMode: "content-hub-site",
          routes: ["/", "/casux-information-platform"],
          files: ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json", "/index.html", "/casux-information-platform/index.html"],
          discoveryBrief: {
            surfaceMode: "content-hub-site",
            localeMode: "bilingual",
            supportedLocales: ["zh-CN", "en"],
            defaultLocale: "zh-CN",
            routes: ["/", "/casux-information-platform"],
          },
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const plan = buildLocalePlan(prompt, "bilingual");
    expect(plan.mode).toBe("bilingual");
    expect(plan.translationDriven).toBe(false);
    expect(plan.defaultLocale).toBe("zh-CN");
    expect(plan.locales).toEqual(["zh-CN", "en"]);
  });

  it("keeps aggregated findings prose out of multilingual mode when ordinary English includes 'it'", () => {
    const findings = [
      "# Findings",
      "",
      "The current draft should remain Chinese-first bilingual for the institutional site.",
      "Keep one locale visible at a time and avoid rendering both languages in the same section.",
      "The summary mentions that it should feel export-ready, but it does not introduce a multilingual requirement.",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify(
        {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          websiteSurfaceMode: "content-hub-site",
          discoveryBrief: {
            localeMode: "bilingual",
            supportedLocales: ["zh-CN", "en"],
            defaultLocale: "zh-CN",
          },
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const plan = buildLocalePlan(findings, "bilingual");
    expect(plan.mode).toBe("bilingual");
    expect(plan.translationDriven).toBe(false);
    expect(plan.defaultLocale).toBe("zh-CN");
    expect(plan.locales).toEqual(["zh-CN", "en"]);
  });
});
