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
  /\b(your company|your brand|company name)\b/i,
  /\b(feature|service|benefit)\s+[123]\b/i,
  /\b(tbd|todo|placeholder|insert (copy|text|image))\b/i,
  /https?:\/\/(?:example\.com|placeholder\.com)/i,
];

const NAV_SCAFFOLD_TOKENS = new Set(["menu", "navigation", "nav", "quick", "links", "quicklinks", "more", "pages", "site"]);
const FOOTER_SCAFFOLD_TOKENS = new Set(["footer", "copyright", "copy", "rights", "reserved", "powered", "quick", "links", "quicklinks", "navigation", "menu", "legal"]);
const PLACEHOLDER_IMAGE_URL_PATTERN =
  /https?:\/\/(?:[\w-]+\.)?(?:example\.com|placeholder\.com|placehold\.co|via\.placeholder\.com|dummyimage\.com|picsum\.photos|source\.unsplash\.com|loremflickr\.com|placekitten\.com|fillmurray\.com)\b[^\s"'<>)]*/i;
const SOURCE_CONTEXT_PATTERN =
  /\b(?:according to|based on|source|cited|citation|report|study|survey|benchmark|measured|measure|internal data|our data|customer data|pilot|case study|analysis|research|audit|observed|tracked|results from|from the)\b/i;
const METRIC_TOKEN_PATTERN = /\b(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?x|\d+\+)\b/i;
const INVENTED_METRIC_CONTEXT_PATTERN =
  /\b(?:faster|boost|increase|improve|reduce|save|hours saved|growth|conversion lift|revenue|roi|engagement|traffic|uplift|outperform|scale)\b/i;

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

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
        /©/.test(footerText));
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
    .split(/[.!?。！？]+/g)
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
    const blockedRoleTerms = [/资料下载/, /下载/, /认证入口/, /认证查询/, /查询/, /申请系统/, /login/i, /register/i];
    const blockedLeadTerms = [/资料下载/, /认证入口/, /认证查询/, /申请系统/, /登录/, /注册/, /login/i, /register/i];
    const leadHomeSignals = [/CASUX/i, /棣栭〉/, /Home/i, /homepage/i, /鍝佺墝/, /鎬昏/, /鏍囧噯浣撶郴/, /涓撲笟鏈烘瀯/, /缁熶竴鍏ュ彛/];
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

    const homeSignals = [/首页/, /Home/i, /homepage/i, /\bhome page\b/i, /主站/, /统一入口/, /总览/, /平台/];
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
    const blogSignals = [/博客/, /Blog/i, /文章/, /资讯/, /data-shpitto-blog-root/i];
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
      "Add an explicit home signal such as Home, Homepage, 首页, 主站, or 统一入口 to the title, H1, or lead copy.",
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
