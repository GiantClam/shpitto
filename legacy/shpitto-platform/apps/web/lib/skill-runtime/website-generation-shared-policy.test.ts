import { describe, expect, it } from "vitest";

import {
  bilingualDefaultVisibleLanguage,
  detectPrimaryLocaleFromRequirement,
  requestedPublishableContentCount,
  requirementRequestsPublishableDetailPages,
  resolveRequestedExperienceLocale,
  shouldRequireBlogDetailPagesForRoute,
} from "./website-generation-shared-policy";

describe("website-generation-shared-policy", () => {
  it("keeps chinese-first bilingual requirements on zh-CN", () => {
    const requirement = [
      "Build a bilingual company website.",
      "Language: Chinese-first bilingual Chinese and English.",
      "Default visible language is Chinese.",
    ].join(" ");

    expect(bilingualDefaultVisibleLanguage(requirement)).toBe("zh-CN");
    expect(detectPrimaryLocaleFromRequirement(requirement)).toBe("zh-CN");
  });

  it("detects explicit bilingual experience requests when no single-locale-first contract overrides them", () => {
    expect(resolveRequestedExperienceLocale("Build a bilingual company website with Chinese and English.")).toBe(
      "bilingual",
    );
  });

  it("parses requested publishable content counts from mixed-language prompts", () => {
    expect(requestedPublishableContentCount("我想做个个人简历网站，需要3篇blog体现我的价值。")).toBe(3);
    expect(requestedPublishableContentCount("Generate 12 complete articles for the resource center.")).toBe(12);
  });

  it("does not force detail pages for collection-surface routes without an explicit publishable request", () => {
    expect(
      shouldRequireBlogDetailPagesForRoute({
        route: "/casux-information-platform",
        navLabel: "Information Platform",
        pageKind: "content-collection-index",
        requirementText: "Build a standards and research hub homepage for policy researchers.",
      }),
    ).toBe(false);
  });

  it("keeps first-pass blog archives index-first and only requires detail pages for explicit publishable asks", () => {
    expect(
      shouldRequireBlogDetailPagesForRoute({
        route: "/blog",
        navLabel: "Blog",
        requirementText: "Build a personal blog with Home and Blog.",
      }),
    ).toBe(false);
    expect(
      shouldRequireBlogDetailPagesForRoute({
        route: "/insights",
        navLabel: "Insights",
        requirementText: "Generate 3 complete articles for the insights archive.",
      }),
    ).toBe(true);
  });

  it("keeps default blog first-pass behavior separate from explicit detail-page requests", () => {
    const defaultBlogRequirement =
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.";
    const deferredDetailRequirement =
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact. Do not generate blog detail pages yet.";
    const explicitDetailRequirement =
      "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact. Publish 3 complete article detail pages with stable /blog/{slug}/ URLs.";

    expect(requirementRequestsPublishableDetailPages(defaultBlogRequirement)).toBe(false);
    expect(
      shouldRequireBlogDetailPagesForRoute({
        route: "/blog",
        navLabel: "Blog",
        requirementText: deferredDetailRequirement,
      }),
    ).toBe(false);
    expect(requestedPublishableContentCount(defaultBlogRequirement)).toBeUndefined();
    expect(requirementRequestsPublishableDetailPages(explicitDetailRequirement)).toBe(true);
    expect(requestedPublishableContentCount(explicitDetailRequirement)).toBe(3);
  });
});
