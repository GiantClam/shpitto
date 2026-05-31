import { describe, expect, it } from "vitest";
import {
  collectSharedDistinctLocaleKeys,
  extractHtmlLang,
  hasBlogNavLink,
  hasConsultationForm,
  hasDistinctTranslatedLocaleResources,
  hasDuplicateFooterLinkGroups,
} from "./institutional-live-quality";

describe("institutional live quality helpers", () => {
  it("extracts bilingual evidence from distinct locale dictionaries", () => {
    const en = JSON.stringify({
      "nav.home": "Home",
      "home.hero.title": "CASUX institutional overview",
    });
    const zh = JSON.stringify({
      "nav.home": "首页",
      "home.hero.title": "CASUX 官方机构总览",
    });

    expect(hasDistinctTranslatedLocaleResources(en, zh)).toBe(true);
    expect(collectSharedDistinctLocaleKeys(en, zh)).toEqual(["home.hero.title", "nav.home"]);
  });

  it("detects missing distinct translations when locale dictionaries are mirrored", () => {
    const mirrored = JSON.stringify({
      "nav.home": "首页",
      "home.hero.title": "CASUX 官方机构总览",
    });

    expect(hasDistinctTranslatedLocaleResources(mirrored, mirrored)).toBe(false);
    expect(collectSharedDistinctLocaleKeys(mirrored, mirrored)).toEqual([]);
  });

  it("detects blog nav leaks and duplicate footer groups while preserving valid institutional shells", () => {
    const html = [
      '<!doctype html><html lang="zh-CN"><body>',
      '<nav><a href="/">首页</a><a href="/blog/">Blog</a></nav>',
      '<footer>',
      '<div class="footer-links"><a href="/">首页</a><a href="/about/">关于</a><a href="/contact/">联系</a></div>',
      '<div class="footer-links"><a href="/">首页</a><a href="/about/">关于</a><a href="/contact/">联系</a></div>',
      "</footer>",
      "</body></html>",
    ].join("");

    expect(extractHtmlLang(html)).toBe("zh-CN");
    expect(hasBlogNavLink(html)).toBe(true);
    expect(hasDuplicateFooterLinkGroups(html)).toBe(true);
  });

  it("detects real consultation forms", () => {
    const html = [
      "<form>",
      '<input name="name" />',
      '<input name="organization" />',
      '<input name="email" type="email" />',
      '<textarea name="message"></textarea>',
      "</form>",
    ].join("");

    expect(hasConsultationForm(html)).toBe(true);
  });
});
