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

function uniqueHexColors(html: string): string[] {
  return Array.from(new Set((html.match(HEX_COLOR_PATTERN) || []).map((color) => color.slice(0, 7).toLowerCase())));
}

function pushIssue(issues: AntiSlopIssue[], issue: AntiSlopIssue) {
  if (issues.some((item) => item.code === issue.code)) return;
  issues.push(issue);
}

export function lintGeneratedWebsiteHtml(html: string): AntiSlopLintResult {
  const source = String(html || "");
  const lower = source.toLowerCase();
  const text = stripTags(source);
  const issues: AntiSlopIssue[] = [];

  if (!/<meta\s+name=["']viewport["']/i.test(source)) {
    pushIssue(issues, {
      code: "missing-viewport",
      severity: "error",
      message: "Missing viewport meta tag; mobile preview will not be WYSIWYG.",
    });
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(source)) {
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

  if (!/@media\b/i.test(source) && !/clamp\(/i.test(source) && !/container-type|@container/i.test(source)) {
    pushIssue(issues, {
      code: "weak-responsive-css",
      severity: "warning",
      message: "No media queries, CSS clamp, or container query found; strengthen desktop/mobile responsive behavior.",
    });
  }

  if (!/<(?:img|svg|picture|video|canvas)\b/i.test(source) && !/linear-gradient|radial-gradient|conic-gradient/i.test(source)) {
    pushIssue(issues, {
      code: "flat-visual-system",
      severity: "warning",
      message: "No imagery, SVG, media, or gradient system found; add stronger visual anchors.",
    });
  }

  if (uniqueHexColors(source).length > 0 && uniqueHexColors(source).length < 4) {
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

export function renderAntiSlopFeedback(result: AntiSlopLintResult): string {
  if (result.issues.length === 0) return "";
  return result.issues.map((issue) => `- [anti-slop/${issue.code}] ${issue.message}`).join("\n");
}
