export type AntiSlopIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export type AntiSlopLintResult = {
  passed: boolean;
  score: number;
  issues: AntiSlopIssue[];
};

export type WebsiteRouteLintContext = {
  route?: string;
  navLabel?: string;
  pagePurpose?: string;
};

const PLACEHOLDER_PATTERNS = [
  /\blorem ipsum\b/i,
  /\b(company name)\b/i,
  /\b(feature|service|benefit)\s+[123]\b/i,
  /\b(tbd|todo|placeholder|insert (copy|text|image))\b/i,
  /https?:\/\/(?:example\.com|placeholder\.com)/i,
];
const GENERIC_PLACEHOLDER_TITLE_PATTERN = /^\s*(?:your company|your brand|company name)\s*$/i;

const NAV_SCAFFOLD_TOKENS = new Set(["menu", "navigation", "nav", "quick", "links", "quicklinks", "more", "pages", "site"]);
const FOOTER_SCAFFOLD_TOKENS = new Set(["footer", "copyright", "copy", "rights", "reserved", "powered", "quick", "links", "quicklinks", "navigation", "menu", "legal"]);
const PLACEHOLDER_IMAGE_URL_PATTERN =
  /https?:\/\/(?:[\w-]+\.)?(?:example\.com|placeholder\.com|placehold\.co|via\.placeholder\.com|dummyimage\.com|picsum\.photos|source\.unsplash\.com|loremflickr\.com|placekitten\.com|fillmurray\.com)\b[^\s"'<>)]*/i;
const MOJIBAKE_PATTERN = /(?:\u9225|\u9219|\u6d93|\u6e1a|\u95c1|\u70bd|\u941b|\u00c2|\u00e2\u20ac|\ufffd|[A-Za-z][\u4e00-\u9fff]{2,}\?|[\u4e00-\u9fff]{2,}\?[A-Za-z])/;
const SOURCE_CONTEXT_PATTERN =
  /\b(?:according to|based on|source|cited|citation|report|study|survey|benchmark|measured|measure|internal data|our data|customer data|pilot|case study|analysis|research|audit|observed|tracked|results from|from the)\b/i;
const METRIC_TOKEN_PATTERN = /\b(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?x|\d+\+)\b/i;
const INVENTED_METRIC_CONTEXT_PATTERN =
  /\b(?:faster|boost|increase|improve|reduce|save|hours saved|growth|conversion lift|revenue|roi|engagement|traffic|uplift|outperform|scale)\b/i;

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const GENERIC_CTA_LABEL_PATTERN = /^(?:learn more|get started|read more|click here|submit|more|start now)$/i;
const LEAD_CLASS_PATTERN = /\b(?:hero-lead|section-lead|lead)\b/i;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripElements(html: string, tagNames: string[]): string {
  return tagNames.reduce((current, tagName) => {
    return current.replace(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi"), " ");
  }, String(html || ""));
}

function uniqueHexColors(html: string): string[] {
  return Array.from(new Set((html.match(HEX_COLOR_PATTERN) || []).map((color) => color.slice(0, 7).toLowerCase())));
}

function pushIssue(issues: AntiSlopIssue[], issue: AntiSlopIssue) {
  if (issues.some((item) => item.code === issue.code)) return;
  issues.push(issue);
}

function combineIssues(...results: AntiSlopLintResult[]): AntiSlopLintResult {
  const issues: AntiSlopIssue[] = [];
  for (const result of results) {
    for (const issue of result.issues) {
      pushIssue(issues, issue);
    }
  }

  const score = results.length
    ? Math.max(
        0,
        Math.min(...results.map((result) => Number.isFinite(result.score) ? result.score : 0)),
      )
    : 100;

  return {
    passed: issues.every((issue) => issue.severity !== "error") && score >= 84,
    score,
    issues,
  };
}

function extractTagText(source: string, tagName: string): string {
  const match = String(source || "").match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return String(match?.[1] || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagBlock(source: string, tagName: string): string {
  const match = String(source || "").match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return String(match?.[1] || "");
}

function extractAnchorTexts(source: string): string[] {
  return Array.from(String(source || "").matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) =>
      String(match[1] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function extractActionLabels(source: string): string[] {
  return Array.from(String(source || "").matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi))
    .map((match) => stripTags(String(match[2] || "")))
    .filter(Boolean);
}

function extractClassedParagraphTexts(source: string, classPattern: RegExp): string[] {
  return Array.from(String(source || "").matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi))
    .filter((match) => classPattern.test(String(match[1] || "")))
    .map((match) => stripTags(String(match[2] || "")))
    .filter(Boolean);
}

function sentenceCount(text: string): number {
  return String(text || "")
    .split(/[.!?\u3002\uff01\uff1f]+/g)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function latinWordCount(text: string): number {
  return (String(text || "").match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function extractMetaDescription(source: string): string {
  const match = String(source || "").match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  return String(match?.[1] || "").replace(/\s+/g, " ").trim();
}

function extractLeadText(source: string): string {
  const main = String(source || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || source;
  return Array.from(String(main || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .slice(0, 2)
    .map((match) => stripTags(String(match[1] || "")))
    .filter(Boolean)
    .join(" ");
}

function normalizeRoute(route?: string): string {
  const value = String(route || "").trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function createIssue(
  code: string,
  severity: "error" | "warning",
  message: string,
): AntiSlopIssue {
  return { code, severity, message };
}

function normalizeLabelTokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u2e80-\u9fff]+/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function countMeaningfulTokens(text: string, scaffoldTokens: Set<string>): number {
  return normalizeLabelTokens(text).filter((token) => {
    if (scaffoldTokens.has(token)) return false;
    if (/^\d{2,4}$/.test(token)) return false;
    if (/^\d+(?:\.\d+)?%?$/.test(token)) return false;
    return token.length > 1;
  }).length;
}

function hasSourceContext(text: string): boolean {
  return SOURCE_CONTEXT_PATTERN.test(text);
}

function hasInventedMetricClaim(sentence: string): boolean {
  const text = String(sentence || "").trim();
  if (!text || hasSourceContext(text)) return false;

  if (METRIC_TOKEN_PATTERN.test(text) && INVENTED_METRIC_CONTEXT_PATTERN.test(text)) {
    return true;
  }

  return /\bhours saved\b/i.test(text) || /\bconversion lift\b/i.test(text) || (/\bgrowth\b/i.test(text) && /(?:claim|boost|drive|increase|improve|unlock|deliver|generate|accelerate)/i.test(text));
}

export function lintGeneratedWebsiteHtml(html: string): AntiSlopLintResult {
  const source = String(html || "");
  const lower = source.toLowerCase();
  const text = stripTags(source);
  const issues: AntiSlopIssue[] = [];
  const hasExternalStylesheet = /<link\b[^>]*rel=["']stylesheet["'][^>]*>/i.test(source);
  const titleText = extractTagText(source, "title");
  const h1Text = extractTagText(source, "h1");
  const hasTable = /<table\b/i.test(source);
  const hasResponsiveTableShell =
    /<(?:div|section|figure)\b[^>]*(?:class|id)=["'][^"']*(?:table-wrap|table-wrapper|responsive-table|scroll-table|data-table|comparison-table)[^"']*["'][^>]*>\s*<table\b/i.test(
      source,
    ) ||
    /<table\b[^>]*(?:class|id)=["'][^"']*(?:responsive|stacked|comparison|data-table)[^"']*["']/i.test(source) ||
    /<(?:div|section|figure)\b[^>]*style=["'][^"']*overflow-x\s*:\s*auto[^"']*["'][^>]*>\s*<table\b/i.test(source);

  if (!/<meta\s+name=["']viewport["']/i.test(source)) {
    pushIssue(issues, {
      code: "missing-viewport",
      severity: "error",
      message: "Missing viewport meta tag; mobile preview will not be WYSIWYG.",
    });
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text) || /https?:\/\/(?:example\.com|placeholder\.com)/i.test(source)) {
      pushIssue(issues, {
        code: "placeholder-copy",
        severity: "error",
        message: "Placeholder or generic template copy detected; replace it with project-specific content.",
      });
      break;
    }
  }
  if (GENERIC_PLACEHOLDER_TITLE_PATTERN.test(titleText) || GENERIC_PLACEHOLDER_TITLE_PATTERN.test(h1Text)) {
    pushIssue(issues, {
      code: "placeholder-copy",
      severity: "error",
      message: "Placeholder or generic template copy detected; replace it with project-specific content.",
    });
  }

  if (MOJIBAKE_PATTERN.test(text)) {
    pushIssue(issues, {
      code: "mojibake-visible-copy",
      severity: "error",
      message: "Visible copy contains mojibake or encoding-corrupted punctuation; replace it with clean final text.",
    });
  }

  if (hasTable && !hasResponsiveTableShell) {
    pushIssue(issues, {
      code: "table-responsive-risk",
      severity: "error",
      message: "Table markup is missing a responsive shell or stacked-table contract, which can clip content on mobile.",
    });
  }

  for (const label of extractActionLabels(source)) {
    if (GENERIC_CTA_LABEL_PATTERN.test(label)) {
      pushIssue(issues, {
        code: "generic-cta-label",
        severity: "warning",
        message: "CTA label is generic; use action-specific wording that tells visitors what happens next.",
      });
      break;
    }
  }

  const longHeadline = [h1Text, ...Array.from(source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)).map((match) => stripTags(match[1] || ""))]
    .filter(Boolean)
    .find((heading) => latinWordCount(heading) > 16);
  if (longHeadline) {
    pushIssue(issues, {
      code: "overlong-headline",
      severity: "warning",
      message: "A major headline is doing too much work; keep generated H1/H2 copy closer to Open Design's concise headline discipline.",
    });
  }

  const overlongLead = extractClassedParagraphTexts(source, LEAD_CLASS_PATTERN).find((lead) => lead.length > 170 || sentenceCount(lead) > 2);
  if (overlongLead) {
    pushIssue(issues, {
      code: "overlong-lead-copy",
      severity: "warning",
      message: "Lead copy is too long; keep hero and section leads short enough to scan before deeper body content.",
    });
  }

  const sectionCount = (lower.match(/<section\b/g) || []).length;
  if (sectionCount > 0 && sectionCount < 4) {
    pushIssue(issues, {
      code: "thin-section-depth",
      severity: "warning",
      message: "The page has fewer than four semantic sections; add stronger page depth and visual rhythm.",
    });
  }

  if (text.length > 0 && text.length < 900) {
    pushIssue(issues, {
      code: "thin-content",
      severity: "warning",
      message: "The page copy is very thin; add differentiated, specific content instead of broad claims.",
    });
  }

  const inlineCss = [
    ...Array.from(source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map((match) => String(match[1] || "")),
    ...Array.from(source.matchAll(/\sstyle=["']([^"']+)["']/gi)).map((match) => String(match[1] || "")),
  ].join("\n");
  if (
    !hasExternalStylesheet &&
    inlineCss &&
    !/@media\b/i.test(inlineCss) &&
    !/clamp\(/i.test(inlineCss) &&
    !/container-type|@container/i.test(inlineCss)
  ) {
    pushIssue(issues, {
      code: "weak-responsive-css",
      severity: "warning",
      message: "No media queries, CSS clamp, or container query found; strengthen desktop/mobile responsive behavior.",
    });
  }

  const hasInlineVisualSystem = /<(?:img|svg|picture|video|canvas)\b/i.test(source) ||
    /linear-gradient|radial-gradient|conic-gradient/i.test(source);
  if (!hasExternalStylesheet && !hasInlineVisualSystem) {
    pushIssue(issues, {
      code: "flat-visual-system",
      severity: "warning",
      message: "No imagery, SVG, media, or gradient system found; add stronger visual anchors.",
    });
  }

  if (!hasExternalStylesheet && uniqueHexColors(source).length > 0 && uniqueHexColors(source).length < 4) {
    pushIssue(issues, {
      code: "weak-color-range",
      severity: "warning",
      message: "The color range looks too narrow; define a richer token palette from the selected design system.",
    });
  }

  if (/\b(font-family\s*:\s*(?:Arial|Inter|Roboto|system-ui)[^;]*;)/i.test(source) && !/@font-face|fonts\.googleapis|font-display/i.test(source)) {
    pushIssue(issues, {
      code: "default-typography",
      severity: "warning",
      message: "Default typography detected; use the selected design direction's expressive font pairing.",
    });
  }

  const navBlock = extractTagBlock(source, "nav");
  if (navBlock) {
    const navText = extractTagText(navBlock, "nav") || stripTags(navBlock);
    const navLabels = extractAnchorTexts(navBlock);
    const navMeaningfulTokens = countMeaningfulTokens(`${navText} ${navLabels.join(" ")}`, NAV_SCAFFOLD_TOKENS);
    const looksLikeMobileNav = /(?:mobile[-_\s]?nav|nav[-_\s]?drawer|menu[-_\s]?toggle|hamburger)/i.test(source);
    const hasGenericNavScaffold = /\b(?:menu|navigation|quick\s*links?|nav)\b/i.test(navText);
    if ((hasGenericNavScaffold || looksLikeMobileNav) && navMeaningfulTokens === 0) {
      pushIssue(issues, {
        code: "nav-scaffold-copy",
        severity: "warning",
        message: "Navigation shell uses generic menu/navigation/quick links copy without meaningful route labels.",
      });
      if (looksLikeMobileNav && navLabels.length === 0) {
        pushIssue(issues, {
          code: "mobile-nav-scaffold-copy",
          severity: "warning",
          message: "Mobile nav collapses into a menu-only scaffold without meaningful destinations; keep the real links visible in markup.",
        });
      }
    }
  }

  const footerBlock = extractTagBlock(source, "footer");
  if (footerBlock) {
    const footerText = extractTagText(footerBlock, "footer") || stripTags(footerBlock);
    const footerLabels = extractAnchorTexts(footerBlock);
    const footerMeaningfulTokens = countMeaningfulTokens(`${footerText} ${footerLabels.join(" ")}`, FOOTER_SCAFFOLD_TOKENS);
    const footerHasScaffoldOnly =
      footerMeaningfulTokens === 0 &&
      (/\b(?:footer|copyright|all rights reserved|powered by|quick\s*links?|navigation|menu)\b/i.test(footerText) ||
        /\u00a9/.test(footerText));
    const footerLooksLikePlaceholder =
      footerMeaningfulTokens <= 1 &&
      /\b(?:copyright|all rights reserved|footer)\b/i.test(footerText) &&
      !/\b20\d{2}\b/.test(footerText);
    if (footerHasScaffoldOnly || footerLooksLikePlaceholder) {
      pushIssue(issues, {
        code: "footer-scaffold-copy",
        severity: "warning",
        message: "Footer is only scaffold copy; add genuine site content, brand context, or meaningful site links.",
      });
    }
  }

  if (PLACEHOLDER_IMAGE_URL_PATTERN.test(source)) {
    pushIssue(issues, {
      code: "external-placeholder-image",
      severity: "error",
      message: "External placeholder or demo image URL detected; replace it with source-backed or project-owned imagery.",
    });
  }

  for (const sentence of text
    .split(/[.!?\u3002\uff01\uff1f]+/g)
    .map((part) => part.trim())
    .filter(Boolean)) {
    if (hasInventedMetricClaim(sentence)) {
      pushIssue(issues, {
        code: "invented-metric-claim",
        severity: "error",
        message: "Standalone marketing metric claim detected without source-backed context; remove it or cite the evidence.",
      });
      break;
    }
  }

  const score = Math.max(
    0,
    100 -
      issues.reduce((sum, issue) => {
        return sum + (issue.severity === "error" ? 18 : 7);
      }, 0),
  );

  return {
    passed: issues.every((issue) => issue.severity !== "error") && score >= 84,
    score,
    issues,
  };
}

export function lintGeneratedWebsiteRouteHtml(html: string, context: WebsiteRouteLintContext = {}): AntiSlopLintResult {
  const source = String(html || "");
  const route = normalizeRoute(context.route);
  const text = stripTags(source);
  const title = extractTagText(source, "title");
  const h1 = extractTagText(source, "h1");
  const body = `${title} ${h1} ${text}`.trim();
  const issues: AntiSlopIssue[] = [];

  if (route === "/") {
    const homepageRoleText = [
      title,
      extractMetaDescription(source),
      h1,
    ]
      .filter(Boolean)
      .join(" ");
    const homepageLeadText = extractLeadText(stripElements(source, ["nav", "footer"]));
    const blockedRoleTerms = [/\u8d44\u6599\u4e0b\u8f7d/, /\u8ba4\u8bc1/, /\u4e0b\u8f7d/, /download/i, /certification/i, /login/i, /register/i];
    const blockedLeadTerms = [/\u8d44\u6599\u4e0b\u8f7d/, /\u8ba4\u8bc1/, /\u4e0b\u8f7d/, /download/i, /certification/i, /login/i, /register/i];
    const leadHomeSignals = [/CASUX/i, /\u9996\u9875/, /Home/i, /homepage/i, /\u54c1\u724c/, /\u603b\u89c8/, /\u6807\u51c6\u4f53\u7cfb/, /\u4e13\u4e1a\u673a\u6784/, /\u7edf\u4e00\u5165\u53e3/];
    if (
      blockedRoleTerms.some((pattern) => pattern.test(homepageRoleText)) ||
      (blockedLeadTerms.some((pattern) => pattern.test(homepageLeadText)) &&
        !leadHomeSignals.some((pattern) => pattern.test(homepageLeadText)))
    ) {
      pushIssue(
        issues,
        createIssue(
          "root-route-semantic-mismatch",
          "error",
          "Homepage route / is using downstream download or certification semantics; reframe it as the site home entry.",
        ),
      );
    }

    const homeSignals = [/Home/i, /homepage/i, /\bhome page\b/i, /\u9996\u9875/, /\u4e3b\u7ad9/, /\u7edf\u4e00\u5165\u53e3/, /CASUX/i];
    if (!homeSignals.some((pattern) => pattern.test(body))) {
      pushIssue(
        issues,
        createIssue(
          "root-route-home-signal-missing",
          "warning",
          "Homepage route / should include a clear home signal in the title, first heading, or lead copy.",
        ),
      );
    }
  }

  if (route === "/blog") {
    const blogSignals = [/Blog/i, /blog/i, /\u535a\u5ba2/, /\u6587\u7ae0/, /data-shpitto-blog-root/i];
    if (!blogSignals.some((pattern) => pattern.test(body))) {
      pushIssue(
        issues,
        createIssue(
          "blog-route-semantic-mismatch",
          "warning",
          "Blog route /blog should read like a native content surface, not a detached product page.",
        ),
      );
    }
  }

  const score = Math.max(
    0,
    100 -
      issues.reduce((sum, issue) => {
        return sum + (issue.severity === "error" ? 22 : 8);
      }, 0),
  );

  return {
    passed: issues.every((issue) => issue.severity !== "error") && score >= 84,
    score,
    issues,
  };
}

export function lintGeneratedWebsiteStyles(css: string): AntiSlopLintResult {
  const source = String(css || "");
  const issues: AntiSlopIssue[] = [];
  const pageVisualBlock = source.match(/\.page-visual\b[^{]*\{([\s\S]*?)\}/i)?.[1] || "";
  const visualCardBlock = source.match(/\.visual-card--main\b[^{]*\{([\s\S]*?)\}/i)?.[1] || "";
  const cardGridBlock = source.match(/\.card-grid\b[^{]*\{([\s\S]*?)\}/i)?.[1] || "";
  const searchResultBlock = source.match(/\.search-result\b[^{]*\{([\s\S]*?)\}/i)?.[1] || "";
  const headingWrapBlockPattern =
    /(?:h[1-3]\b|\.section-title\b|\.hero\s+h1\b|\.hero-title\b|\.page-title\b)[^{]*\{[^}]*?(?:overflow-wrap\s*:\s*anywhere|word-break\s*:\s*break-all)/i;
  const headingHyphenationPattern =
    /(?:h[1-3]\b|\.section-title\b|\.hero\s+h1\b|\.hero-title\b|\.page-title\b)[^{]*\{[^}]*?hyphens\s*:\s*auto/i;
  const compressedHeroStatGridPattern =
    /\.hero[_\s-]*rail\b[\s\S]*?\.stat-list\b|\.\s*stat-list\b[\s\S]*?\.hero[_\s-]*rail\b/i;
  const narrowStatListPattern = /\.stat-list\b[^{]*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/i;
  const rawHexOutsideRootCount = (source.replace(/:root\b[^{]*\{[^}]*\}/gi, "").match(HEX_COLOR_PATTERN) || []).length;

  const parseMinHeight = (block: string) => {
    const match = block.match(/min-height\s*:\s*(\d+)px/i);
    return match ? Number(match[1]) : 0;
  };

  const pageVisualMinHeight = parseMinHeight(pageVisualBlock);
  const visualCardMinHeight = parseMinHeight(visualCardBlock);
  const hasVisualRail = /\.page-visual\b/i.test(source) || /\.visual-card--main\b/i.test(source);
  const hasVisualMediaContract =
    /\.visual-card--main\s+(?:img|svg|video|canvas|figure|picture)\b/i.test(source) ||
    /\.page-visual\s+(?:img|svg|video|canvas|figure|picture)\b/i.test(source) ||
    /background-image\s*:|aspect-ratio\s*:|object-fit\s*:/i.test(visualCardBlock);
  const alignContentEnd = /align-content\s*:\s*end/i.test(visualCardBlock);

  if (
    hasVisualRail &&
    (pageVisualMinHeight >= 480 || visualCardMinHeight >= 300 || alignContentEnd) &&
    !hasVisualMediaContract
  ) {
    pushIssue(
      issues,
      createIssue(
        "empty-hero-visual-rail",
        "error",
        "Hero visual rail is oversized without a real media, chart, or data-viz contract; shrink it or add actual visual content.",
      ),
    );
  }

  const hasTwelveColumnGrid = /grid-template-columns\s*:\s*repeat\(12/i.test(cardGridBlock) || /repeat\(12,\s*minmax\(/i.test(source);
  const searchResultSpansFullWidth = /\.search-result\b[^{]*\{[\s\S]*grid-column\s*:\s*(?:span\s*12|1\s*\/\s*-1)/i.test(source);
  if (hasTwelveColumnGrid && /\.search-result\b/i.test(source) && !searchResultSpansFullWidth) {
    pushIssue(
      issues,
      createIssue(
        "search-result-width-mismatch",
        "error",
        "Search results are inside a 12-column grid but do not span the full row; add a full-width grid-column rule.",
      ),
    );
  }

  if (headingWrapBlockPattern.test(source)) {
    pushIssue(
      issues,
      createIssue(
        "heading-copy-break-risk",
        "error",
        "Major heading styles allow arbitrary word breaks, which can split names or possessives in polished homepage copy.",
      ),
    );
  }

  if (/letter-spacing\s*:\s*-\s*(?:\d|\.)/i.test(source)) {
    pushIssue(
      issues,
      createIssue(
        "negative-letter-spacing",
        "error",
        "Negative letter spacing creates fragile heading and button rendering across generated responsive pages.",
      ),
    );
  }

  if (headingHyphenationPattern.test(source)) {
    pushIssue(
      issues,
      createIssue(
        "heading-hyphenation-risk",
        "error",
        "Major heading styles enable automatic hyphenation, which can split key terms in mobile screenshots.",
      ),
    );
  }

  if (compressedHeroStatGridPattern.test(source) && narrowStatListPattern.test(source)) {
    pushIssue(
      issues,
      createIssue(
        "compressed-hero-stat-grid",
        "error",
        "Hero stat cards use three equal narrow columns, which can turn short facts into cramped vertical text blocks.",
      ),
    );
  }

  if (rawHexOutsideRootCount > 2) {
    pushIssue(
      issues,
      createIssue(
        "raw-hex-outside-root",
        "warning",
        "Generated CSS uses repeated raw hex colors outside the token block; Open Design keeps colors bound to root tokens or derived color-mix values.",
      ),
    );
  }

  const score = Math.max(
    0,
    100 -
      issues.reduce((sum, issue) => {
        return sum + (issue.severity === "error" ? 22 : 8);
      }, 0),
  );

  return {
    passed: issues.every((issue) => issue.severity !== "error") && score >= 84,
    score,
    issues,
  };
}

export function renderAntiSlopFeedback(result: AntiSlopLintResult): string {
  if (result.issues.length === 0) return "";
  const fixHints: Record<string, string> = {
    "root-route-semantic-mismatch":
      "Rewrite route / so title, meta description, H1, and the first lead paragraph present the site home entry; move download, certification, query, and login wording into secondary navigation/cards only.",
    "root-route-home-signal-missing":
      "Add an explicit home signal such as Home, Homepage, 濠碘槅鍋撶徊楣冩偋閻樿违? 濠电偞鍨堕幑浣哥暦閻㈠憡鍋? or 缂傚倸鍊烽懗鍫曞窗瀹ュ洨鍗氶柟缁㈠枛缁€鍌炴煏婢跺牆鍔氱紓?to the title, H1, or lead copy.",
    "weak-responsive-css":
      "Add at least one @media block and one clamp() or container query so typography, spacing, or layout adapts on mobile.",
    "nav-scaffold-copy":
      "Rewrite the navigation labels so they are route-specific instead of generic menu/navigation shells.",
    "mobile-nav-scaffold-copy":
      "Keep the mobile nav connected to real destinations instead of a menu-only shell with no meaningful links.",
    "footer-scaffold-copy":
      "Replace footer placeholder copy with brand context, useful site content, or legitimate legal/navigation links that add real value.",
    "external-placeholder-image":
      "Swap placeholder/demo image URLs for project-owned or source-backed assets, and keep image provenance tied to the brief or citation.",
    "invented-metric-claim":
      "Remove unsourced percentages, multipliers, and growth claims unless the brief or a cited source explicitly supports them.",
    "empty-hero-visual-rail":
      "Either reduce the hero visual rail height or put real media, chart, or data-viz content inside it instead of leaving a large empty block.",
    "search-result-width-mismatch":
      "Make .search-result span the full grid row, for example grid-column: 1 / -1, so 12-column results stay readable.",
    "heading-copy-break-risk":
      "Remove overflow-wrap:anywhere or word-break:break-all from h1/h2/h3 and display heading selectors; use normal wrapping, balanced max-widths, and responsive font clamps instead.",
    "negative-letter-spacing":
      "Set letter-spacing to 0 for generated UI text unless a non-negative token is explicitly required for small uppercase labels.",
    "heading-hyphenation-risk":
      "Remove hyphens:auto from h1/h2/h3 and display heading selectors; let headings wrap at spaces and tune max-width or font-size instead.",
    "table-responsive-risk":
      "Wrap each table in a responsive table shell such as .table-wrap/.responsive-table with horizontal overflow, or render the same information as stacked cards on mobile.",
    "mojibake-visible-copy":
      "Replace corrupted sequences such as 闂?or 闂佽偐鍎ょ敮锟犲春閳?with clean ASCII punctuation or valid UTF-8 characters before shipping the page.",
    "compressed-hero-stat-grid":
      "Use one-column stat stacks, roomy horizontal cards, or minmax(12rem, 1fr) tracks, and keep each hero-side stat to a short label/fact.",
    "raw-hex-outside-root":
      "Move repeated raw colors into :root tokens and reference them with var(...) or color-mix(...) so the visual system stays coherent.",
    "generic-cta-label":
      "Replace generic CTA labels with concrete actions such as Explore documentation areas, Review standards, Request demo, or Open the guide.",
    "overlong-headline":
      "Shorten major H1/H2 copy to a sharp subject statement; move qualifiers into the lead or body copy.",
    "overlong-lead-copy":
      "Keep hero and section lead paragraphs to one or two concise sentences, then move supporting detail into cards or body sections.",
  };

  return result.issues
    .map((issue) => {
      const hint = fixHints[issue.code];
      return hint ? `- [anti-slop/${issue.code}] ${issue.message} Fix: ${hint}` : `- [anti-slop/${issue.code}] ${issue.message}`;
    })
    .join("\n");
}

export function mergeAntiSlopLintResults(...results: AntiSlopLintResult[]): AntiSlopLintResult {
  return combineIssues(...results);
}
