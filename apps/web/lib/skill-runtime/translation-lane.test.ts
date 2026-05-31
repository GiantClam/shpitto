import { describe, expect, it } from "vitest";
import { applyTranslationLane, resolveTranslationLanePlan } from "./translation-lane";

function buildProjectFixture() {
  return {
    projectId: "chat-demo",
    pages: [{ path: "/", html: "<!doctype html><html lang=\"en\"><body><h1>Home</h1></body></html>" }],
    staticSite: {
      mode: "skill-direct",
      files: [
        {
          path: "/index.html",
          type: "text/html",
          content: "<!doctype html><html lang=\"en\"><body><h1>Home</h1></body></html>",
        },
        {
          path: "/i18n/messages.en.json",
          type: "application/json",
          content: JSON.stringify(
            {
              "nav.home": "Home",
              "hero.title": "Thoughtful AI notes",
            },
            null,
            2,
          ),
        },
      ],
    },
  };
}

describe("translation-lane", () => {
  it("resolves translation plan from workflow locale context", () => {
    const plan = resolveTranslationLanePlan({
      project: buildProjectFixture(),
      instructionText: "Generate locale catalogs for English, French, and Japanese.",
      workflowContext: {
        supportedLocales: ["en", "fr", "ja"],
        defaultLocale: "en",
        translationTargetLocales: ["fr", "ja"],
      },
    });

    expect(plan).not.toBeNull();
    expect(plan?.defaultLocale).toBe("en");
    expect(plan?.supportedLocales).toEqual(["en", "fr", "ja"]);
    expect(plan?.targetLocales).toEqual(["fr", "ja"]);
    expect(plan?.sourceCatalogPath).toBe("/i18n/messages.en.json");
    expect(plan?.sourceMessages).toEqual({
      "nav.home": "Home",
      "hero.title": "Thoughtful AI notes",
    });
  });

  it("applies translated catalogs and falls back on missing keys", async () => {
    const plan = resolveTranslationLanePlan({
      project: buildProjectFixture(),
      instructionText: "Generate locale catalogs for English, French, and Japanese.",
      workflowContext: {
        supportedLocales: ["en", "fr", "ja"],
        defaultLocale: "en",
        translationTargetLocales: ["fr", "ja"],
      },
    });

    expect(plan).not.toBeNull();
    const result = await applyTranslationLane({
      project: buildProjectFixture(),
      plan: plan!,
      translateCatalog: async ({ targetLocale, sourceMessages }) => {
        if (targetLocale === "fr") {
          return {
            translated: true,
            messages: {
              "nav.home": "Accueil",
              "hero.title": "Notes IA reflechies",
            },
          };
        }
        return {
          translated: false,
          messages: {
            "nav.home": "Home JA",
            "hero.title": sourceMessages["hero.title"] || "",
          },
          note: "fallback to source for missing values",
        };
      },
    });

    const files = new Map(
      result.project.staticSite.files.map((file: { path: string; content: string }) => [file.path, file.content] as const),
    );

    expect(result.changedFiles).toEqual([
      "/i18n/locales.json",
      "/i18n/messages.fr.json",
      "/i18n/messages.ja.json",
    ]);
    expect(JSON.parse(String(files.get("/i18n/locales.json")))).toEqual({
      defaultLocale: "en",
      locales: ["en", "fr", "ja"],
      translationDriven: true,
      sourceCatalog: "/i18n/messages.en.json",
    });
    expect(JSON.parse(String(files.get("/i18n/messages.fr.json")))).toEqual({
      "nav.home": "Accueil",
      "hero.title": "Notes IA reflechies",
    });
    expect(JSON.parse(String(files.get("/i18n/messages.ja.json")))).toEqual({
      "nav.home": "Home JA",
      "hero.title": "Thoughtful AI notes",
    });
    expect(result.validationReport.translatedLocales).toEqual(["fr"]);
    expect(result.validationReport.fallbackLocales).toEqual(["ja"]);
    expect(result.validationReport.missingKeyFillCount).toBe(0);
  });
});
