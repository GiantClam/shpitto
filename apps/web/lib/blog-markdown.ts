function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function sanitizeUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "#";
  if (raw.startsWith("/") || raw.startsWith("#")) return escapeHtml(raw);
  try {
    const url = new URL(raw);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) {
      return escapeHtml(raw);
    }
  } catch {
    // Relative paths without a leading slash are intentionally rejected.
  }
  return "#";
}

function escapeRegex(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeBlogMarkdown(markdown: string) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]*<br\s*\/?>[ \t]*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeBlogSlug(value: string, fallbackSeed?: string) {
  const fromValue = slugify(value);
  if (fromValue) return fromValue;
  const fromSeed = slugify(fallbackSeed || "");
  if (fromSeed) return fromSeed;
  return `post-${Date.now().toString(36)}`;
}

export function resolveUniqueBlogSlug(baseSlug: string, occupiedSlugs: string[]) {
  const normalizedBase = normalizeBlogSlug(baseSlug);
  const taken = new Set(
    (Array.isArray(occupiedSlugs) ? occupiedSlugs : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
  if (!taken.has(normalizedBase)) return normalizedBase;

  const suffixPattern = new RegExp(`^${escapeRegex(normalizedBase)}-(\\d+)$`);
  let maxSuffix = 1;
  for (const slug of taken) {
    const match = slug.match(suffixPattern);
    if (!match) continue;
    const next = Number(match[1] || 0);
    if (Number.isFinite(next)) {
      maxSuffix = Math.max(maxSuffix, next);
    }
  }

  let candidate = `${normalizedBase}-${maxSuffix + 1}`;
  while (taken.has(candidate)) {
    maxSuffix += 1;
    candidate = `${normalizedBase}-${maxSuffix + 1}`;
  }
  return candidate;
}

function renderInlineMarkdown(value: string) {
  let output = escapeHtml(value);
  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    return `<img src="${sanitizeUrl(String(src))}" alt="${escapeHtml(String(alt))}" />`;
  });
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    return `<a href="${sanitizeUrl(String(href))}" rel="noreferrer noopener">${label}</a>`;
  });
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  output = output.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return output;
}

function flushParagraph(lines: string[], output: string[]) {
  if (!lines.length) return;
  const text = lines.join(" ").trim();
  if (text) output.push(`<p>${renderInlineMarkdown(text)}</p>`);
  lines.length = 0;
}

export function renderMarkdownToHtml(markdown: string) {
  const source = normalizeBlogMarkdown(markdown);
  if (!source) return "";

  const lines = source.split("\n");
  const output: string[] = [];
  const paragraphLines: string[] = [];
  let codeFenceLang = "";
  let codeFenceLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let quoteItems: string[] = [];

  const flushCodeFence = () => {
    if (!codeFenceLines.length) return;
    const langClass = codeFenceLang ? ` class="language-${escapeHtml(codeFenceLang)}"` : "";
    output.push(`<pre><code${langClass}>${escapeHtml(codeFenceLines.join("\n"))}</code></pre>`);
    codeFenceLines = [];
    codeFenceLang = "";
  };

  const flushList = (items: string[], ordered: boolean) => {
    if (!items.length) return;
    const tag = ordered ? "ol" : "ul";
    output.push(`<${tag}>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
  };

  const flushQuote = (items: string[]) => {
    if (!items.length) return;
    output.push(`<blockquote>${items.map((item) => renderInlineMarkdown(item)).join("<br />")}</blockquote>`);
  };

  const flushStructuredBlocks = () => {
    flushParagraph(paragraphLines, output);
    flushList(listItems, listOrdered);
    listItems = [];
    flushQuote(quoteItems);
    quoteItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (codeFenceLines.length > 0 || codeFenceLang) {
        flushStructuredBlocks();
        flushCodeFence();
      } else {
        flushStructuredBlocks();
        codeFenceLang = trimmed.slice(3).trim();
        codeFenceLines = [];
      }
      continue;
    }

    if (codeFenceLines.length > 0 || codeFenceLang) {
      codeFenceLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushStructuredBlocks();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushStructuredBlocks();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph(paragraphLines, output);
      if (listItems.length) {
        flushList(listItems, listOrdered);
        listItems = [];
      }
      quoteItems.push(quoteMatch[1].trim());
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    const unorderedMatch = trimmed.match(/^-+\s+(.+)$/);
    if (orderedMatch || unorderedMatch) {
      flushParagraph(paragraphLines, output);
      if (quoteItems.length) {
        flushQuote(quoteItems);
        quoteItems = [];
      }
      const ordered = Boolean(orderedMatch);
      if (listItems.length && listOrdered !== ordered) {
        flushList(listItems, listOrdered);
        listItems = [];
      }
      listOrdered = ordered;
      listItems.push((orderedMatch ? orderedMatch[2] : unorderedMatch?.[1] || "").trim());
      continue;
    }

    if (listItems.length) {
      flushList(listItems, listOrdered);
      listItems = [];
    }
    if (quoteItems.length) {
      flushQuote(quoteItems);
      quoteItems = [];
    }
    paragraphLines.push(trimmed);
  }

  flushStructuredBlocks();
  flushCodeFence();

  return output.join("");
}

export function stripMarkdown(markdown: string) {
  return normalizeBlogMarkdown(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[#>*_`~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBlogExcerpt(markdown: string, maxLength = 180) {
  const clean = stripMarkdown(markdown);
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
