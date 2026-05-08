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
