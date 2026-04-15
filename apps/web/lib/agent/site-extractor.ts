import crypto from "node:crypto";

export type ExtractedPage = {
  label: string;
  sourceUrl: string;
  sourcePath: string;
  targetPath: string;
  title: string;
  description: string;
  keywords: string;
  images: string[];
  headings?: string[];
  snippets?: string[];
};

export type ExtractedSite = {
  sourceUrl: string;
  siteName: string;
  logo?: string;
  phone?: string;
  pages: ExtractedPage[];
};

type LinkCandidate = {
  label: string;
  href: string;
  path: string;
};

const SITE_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ShpittoSiteExtractor/1.0; +https://shpitto.com)",
  Accept: "text/html,application/xhtml+xml",
};

const HOME_LABEL_RE = /(首页|home|index)/i;
const COMPANY_LABEL_RE = /(公司|概况|关于|about)/i;
const PRODUCT_LABEL_RE = /(产品|服务|设备|solution|product|service)/i;
const NEWS_LABEL_RE = /(新闻|资讯|blog|news|article)/i;
const CASE_LABEL_RE = /(案例|客户|项目|case|portfolio)/i;
const CONTACT_LABEL_RE = /(联系|咨询|contact)/i;

const INTERNAL_LINK_BLOCK_RE = /^(#|javascript:|mailto:|tel:)/i;
const UI_ASSET_RE =
  /(logo|icon|nav|menu|button|btn|arrow|close|sprite|footer|header|wechat|qq|dao_hang|qv_xiao|er_wei_ma)/i;

function stripTags(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureHttpUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty URL");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function toAbsoluteUrl(urlLike: string, baseUrl: string) {
  return new URL(urlLike, baseUrl).toString();
}

function normalizePath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page";
}

function mappedTargetPath(label: string, sourcePath: string, used: Set<string>) {
  const lc = label.toLowerCase();
  let target = "/page";
  if (HOME_LABEL_RE.test(label) || sourcePath === "/") target = "/";
  else if (COMPANY_LABEL_RE.test(label) || /about/.test(lc)) target = "/company";
  else if (PRODUCT_LABEL_RE.test(label)) target = "/products";
  else if (NEWS_LABEL_RE.test(label)) target = "/news";
  else if (CASE_LABEL_RE.test(label)) target = "/cases";
  else if (CONTACT_LABEL_RE.test(label)) target = "/contact";
  else target = `/${slugify(label)}`;

  if (!used.has(target)) {
    used.add(target);
    return target;
  }

  let n = 2;
  while (used.has(`${target}-${n}`)) n += 1;
  const deduped = `${target}-${n}`;
  used.add(deduped);
  return deduped;
}

async function fetchHtml(url: string) {
  const res = await fetch(url, { headers: SITE_FETCH_HEADERS, redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";

  const headerCharset = contentType.match(/charset=([a-zA-Z0-9_-]+)/i)?.[1]?.toLowerCase();
  const sniff = buf.toString("latin1", 0, 4096);
  const metaCharset =
    sniff.match(/<meta[^>]*charset=["']?\s*([a-zA-Z0-9_-]+)/i)?.[1]?.toLowerCase() ||
    sniff.match(/content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i)?.[1]?.toLowerCase();

  const charset = (headerCharset || metaCharset || "utf-8").replace(/["']/g, "").toLowerCase();

  try {
    return new TextDecoder(charset as any).decode(buf);
  } catch {
    if (/gbk|gb2312|gb18030/i.test(charset)) {
      try {
        return new TextDecoder("gb18030" as any).decode(buf);
      } catch {
        // Fall through to utf-8 decode.
      }
    }
  }

  return buf.toString("utf8");
}

function extractMetaTag(html: string, name: string) {
  const re = new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*>`, "i");
  const m = html.match(re);
  return m?.[1]?.trim() || "";
}

export function extractPageMetadata(html: string) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const description = extractMetaTag(html, "description");
  const keywords = extractMetaTag(html, "keywords");
  return { title, description, keywords };
}

function parseLinkCandidates(html: string, baseUrl: string) {
  const candidates: LinkCandidate[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || "").trim();
    const label = stripTags(m[2] || "").trim();
    if (!href || !label) continue;
    if (INTERNAL_LINK_BLOCK_RE.test(href)) continue;

    let abs: string;
    try {
      abs = toAbsoluteUrl(href, baseUrl);
    } catch {
      continue;
    }

    const base = new URL(baseUrl);
    const absUrl = new URL(abs);
    if (absUrl.origin !== base.origin) continue;

    const path = normalizePath(absUrl.pathname);
    if (!path) continue;

    const dedupeKey = `${path}::${label}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    candidates.push({ label, href: absUrl.toString(), path });
  }

  return candidates;
}

export function selectMainLinks(candidates: LinkCandidate[]) {
  const selected: LinkCandidate[] = [];
  const usedPath = new Set<string>();

  const pick = (matcher: RegExp, fallbackPath?: string) => {
    const item =
      candidates.find((c) => matcher.test(c.label) && !usedPath.has(c.path)) ||
      (fallbackPath ? candidates.find((c) => c.path === fallbackPath && !usedPath.has(c.path)) : undefined);
    if (!item) return;
    usedPath.add(item.path);
    selected.push(item);
  };

  pick(HOME_LABEL_RE, "/");
  pick(COMPANY_LABEL_RE);
  pick(PRODUCT_LABEL_RE);
  pick(NEWS_LABEL_RE);
  pick(CASE_LABEL_RE);
  pick(CONTACT_LABEL_RE);

  for (const c of candidates) {
    if (selected.length >= 6) break;
    if (usedPath.has(c.path)) continue;
    if (c.label.length > 18) continue;
    usedPath.add(c.path);
    selected.push(c);
  }

  return selected.slice(0, 6);
}

function parseImages(html: string, pageUrl: string) {
  const images: Array<{ url: string; attrs: string }> = [];
  const seen = new Set<string>();
  const imgRe = /<img\b([^>]+)>/gi;
  const attrRe = /(src|data-src|data-original)=["']([^"']+)["']/gi;

  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1] || "";
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrs)) !== null) {
      const raw = (am[2] || "").trim();
      if (!raw || raw.startsWith("data:")) continue;

      try {
        const abs = toAbsoluteUrl(raw, pageUrl);
        if (seen.has(abs)) continue;
        seen.add(abs);
        images.push({ url: abs, attrs });
      } catch {
        continue;
      }
    }
  }

  const smallNumeric = (attrs: string, attrName: "width" | "height") => {
    const value = attrs.match(new RegExp(`\\b${attrName}=["']?(\\d{1,4})`, "i"))?.[1];
    if (!value) return undefined;
    return Number(value);
  };

  const smallStyle = (attrs: string) => {
    const style = attrs.match(/\bstyle=["']([^"']+)["']/i)?.[1] || "";
    const w = style.match(/width\s*:\s*(\d{1,4})px/i)?.[1];
    const h = style.match(/height\s*:\s*(\d{1,4})px/i)?.[1];
    return {
      width: w ? Number(w) : undefined,
      height: h ? Number(h) : undefined,
    };
  };

  const isLikelyDecorative = (url: string, attrs: string) => {
    const hay = `${url} ${attrs}`.toLowerCase();
    if (/\.(svg|ico)(\?|$)/i.test(url)) return true;
    if (UI_ASSET_RE.test(hay)) return true;

    const width = smallNumeric(attrs, "width");
    const height = smallNumeric(attrs, "height");
    const styleSize = smallStyle(attrs);
    const finalWidth = width ?? styleSize.width;
    const finalHeight = height ?? styleSize.height;

    if (finalWidth && finalHeight && finalWidth <= 180 && finalHeight <= 180) return true;
    if (finalWidth && !finalHeight && finalWidth <= 140) return true;
    if (finalHeight && !finalWidth && finalHeight <= 140) return true;

    return false;
  };

  const score = (url: string, attrs: string) => {
    const hay = `${url} ${attrs}`.toLowerCase();
    let s = 0;
    if (/upload\/file\/contents|upload\/file\/img/i.test(hay)) s += 8;
    if (/\.(jpg|jpeg|webp|png)(\?|$)/i.test(url)) s += 2;
    if (/template\/pc_web\/statics\/images/i.test(hay)) s -= 4;
    if (UI_ASSET_RE.test(hay)) s -= 10;
    return s;
  };

  const rankedContent = images
    .filter((img) => !isLikelyDecorative(img.url, img.attrs))
    .sort((a, b) => score(b.url, b.attrs) - score(a.url, a.attrs))
    .map((img) => img.url);
  if (rankedContent.length > 0) return rankedContent;

  return images.sort((a, b) => score(b.url, b.attrs) - score(a.url, a.attrs)).map((img) => img.url);
}

function parseHeadings(html: string) {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[2] || "");
    if (!text || text.length < 2) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= 8) break;
  }

  return out;
}

function parseSnippets(html: string) {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1] || "");
    if (!text || text.length < 18 || text.length > 240) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= 8) break;
  }

  return out;
}

function pickLogoCandidate(html: string, pageUrl: string) {
  const imgRe = /<img\b([^>]+)>/gi;
  const srcRe = /(src|data-src|data-original)=["']([^"']+)["']/i;

  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1] || "";
    const srcMatch = attrs.match(srcRe);
    if (!srcMatch?.[2]) continue;

    const scoreStr = attrs.toLowerCase();
    const isLogoLike = /logo|brand|icon/.test(scoreStr) || /logo|brand|icon/.test(srcMatch[2].toLowerCase());
    if (!isLogoLike) continue;

    try {
      return toAbsoluteUrl(srcMatch[2], pageUrl);
    } catch {
      continue;
    }
  }

  return undefined;
}

function extractPhoneFromText(input: string) {
  const m = input.match(/(\+?\d[\d\-\s]{7,}\d)/);
  return m?.[1]?.replace(/\s+/g, "") || undefined;
}

function defaultColorFromDomain(domain: string) {
  const hash = crypto.createHash("md5").update(domain).digest("hex");
  return `#${hash.slice(0, 6).toUpperCase()}`;
}

export async function extractWebsiteMainPages(rawUrl: string): Promise<ExtractedSite> {
  const seedUrl = ensureHttpUrl(rawUrl);
  const homeUrl = new URL(seedUrl);
  homeUrl.pathname = "/";
  homeUrl.search = "";
  homeUrl.hash = "";

  const homeHtml = await fetchHtml(homeUrl.toString());
  const homeMeta = extractPageMetadata(homeHtml);
  const navCandidates = parseLinkCandidates(homeHtml, homeUrl.toString());
  const mainLinks = selectMainLinks(navCandidates);

  if (!mainLinks.some((l) => l.path === "/")) {
    mainLinks.unshift({ label: "首页", href: homeUrl.toString(), path: "/" });
  }

  const usedTargetPath = new Set<string>();
  const pages: ExtractedPage[] = [];

  for (const link of mainLinks.slice(0, 6)) {
    try {
      const html = link.path === "/" ? homeHtml : await fetchHtml(link.href);
      const meta = extractPageMetadata(html);
      const images = parseImages(html, link.href).slice(0, 12);
      const headings = parseHeadings(html);
      const snippets = parseSnippets(html);

      pages.push({
        label: link.label,
        sourceUrl: link.href,
        sourcePath: link.path,
        targetPath: mappedTargetPath(link.label, link.path, usedTargetPath),
        title: meta.title || link.label,
        description: meta.description,
        keywords: meta.keywords,
        images,
        headings,
        snippets,
      });
    } catch {
      pages.push({
        label: link.label,
        sourceUrl: link.href,
        sourcePath: link.path,
        targetPath: mappedTargetPath(link.label, link.path, usedTargetPath),
        title: link.label,
        description: "",
        keywords: "",
        images: [],
        headings: [],
        snippets: [],
      });
    }
  }

  const baseHost = homeUrl.hostname.replace(/^www\./i, "");
  const homePhone = extractPhoneFromText(stripTags(homeHtml));
  const logo = pickLogoCandidate(homeHtml, homeUrl.toString()) || pages.flatMap((p) => p.images)[0];
  const siteName = (homeMeta.title || baseHost).split(/[|_-]/)[0].trim() || baseHost;

  return {
    sourceUrl: homeUrl.toString(),
    siteName,
    logo,
    phone: homePhone,
    pages: pages.slice(0, 6),
  };
}

function pageHeroImage(page: ExtractedPage, fallback?: string) {
  const firstContentImage = page.images.find((img) => !UI_ASSET_RE.test(img));
  return firstContentImage || fallback || page.images[0];
}

function pageGridItems(page: ExtractedPage) {
  const headingPool = page.headings?.length ? page.headings : [];
  const snippetPool = page.snippets?.length ? page.snippets : [];

  return (page.images || []).slice(0, 3).map((img, idx) => ({
    title:
      headingPool[idx] ||
      (headingPool[0] && idx > 0 ? `${headingPool[0]} ${idx + 1}` : headingPool[0] || `${page.label} ${idx + 1}`),
    description: snippetPool[idx] || snippetPool[0] || page.description || `${page.label} content`,
    image: img,
    tag: page.label,
  }));
}

function pagePrimaryHeadline(page: ExtractedPage) {
  if (page.headings?.length) return page.headings[0];
  if (page.title && page.title !== page.label) return page.title;
  return page.label;
}

function normalizedDescKey(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function pagePrimarySnippet(page: ExtractedPage, repeatedDescriptionKeys: Set<string>) {
  if (page.snippets?.length) return page.snippets[0];

  const desc = page.description?.trim() || "";
  if (desc) {
    const key = normalizedDescKey(desc);
    if (!repeatedDescriptionKeys.has(key)) return desc;
    return `${page.label}页面信息，来源路径：${page.sourcePath}`;
  }

  return `${page.label} page from source site`;
}

function pageFeatureBullets(page: ExtractedPage) {
  const fromHeadings = (page.headings || []).slice(1, 4).filter(Boolean);
  if (fromHeadings.length) return fromHeadings;

  const fromKeywords = (page.keywords || "")
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (fromKeywords.length) return fromKeywords;

  return [`${page.label} overview`, `${page.label} highlights`, `${page.label} details`];
}

export function buildProjectFromExtractedSite(extracted: ExtractedSite) {
  const pages = extracted.pages.length
    ? extracted.pages
    : [
        {
          label: "首页",
          sourceUrl: extracted.sourceUrl,
          sourcePath: "/",
          targetPath: "/",
          title: extracted.siteName,
          description: "",
          keywords: "",
          images: [],
        },
      ];

  const dominantColor = defaultColorFromDomain(new URL(extracted.sourceUrl).hostname);
  const accentColor = "#22C55E";
  const flatImages = pages.flatMap((p) => p.images);
  const fallbackImage = flatImages.find((img) => !UI_ASSET_RE.test(img)) || flatImages[0] || "";

  const repeatedDescriptionKeys = new Set<string>();
  const descriptionCount = new Map<string, number>();

  for (const page of pages) {
    const key = normalizedDescKey(page.description || "");
    if (!key) continue;
    descriptionCount.set(key, (descriptionCount.get(key) || 0) + 1);
  }

  for (const [key, count] of descriptionCount.entries()) {
    if (count > 1) repeatedDescriptionKeys.add(key);
  }

  const projectPages = pages.map((page, idx) => {
    const title = `${page.label} | ${extracted.siteName}`;
    const descriptionKey = normalizedDescKey(page.description || "");
    const description =
      page.description && !repeatedDescriptionKeys.has(descriptionKey)
        ? page.description
        : `${extracted.siteName} - ${page.label}`;

    const image = pageHeroImage(page, fallbackImage);
    const gridItems = pageGridItems(page);
    const heroTitle = pagePrimaryHeadline(page);
    const heroSnippet = pagePrimarySnippet(page, repeatedDescriptionKeys);
    const featureBullets = pageFeatureBullets(page);

    const baseContent = [
      {
        id: `hero_${idx + 1}`,
        type: "Hero",
        props: {
          title: heroTitle,
          subtitle: heroSnippet,
          ctaText: "了解更多",
          image,
          theme: idx === 0 ? "dark" : "light",
          align: idx === 0 ? "text-center" : "text-left",
        },
      },
      {
        id: `feature_${idx + 1}`,
        type: "FeatureHighlight",
        props: {
          title: page.label,
          description: heroSnippet,
          image,
          align: idx % 2 === 0 ? "left" : "right",
          features: featureBullets,
        },
      },
      {
        id: `preview_${idx + 1}`,
        type: "ProductPreview",
        props: {
          title: `${page.label} 图集`,
          items: gridItems.length
            ? gridItems
            : [
                {
                  title: page.label,
                  description,
                  image,
                  tag: "Site",
                },
              ],
        },
      },
      {
        id: `cta_${idx + 1}`,
        type: "CTASection",
        props: {
          title: `访问 ${page.label}`,
          description: page.sourceUrl,
          ctaText: "立即咨询",
          ctaLink: extracted.phone ? `tel:${extracted.phone.replace(/[^\d+]/g, "")}` : "#",
          variant: "simple",
        },
      },
    ];

    return {
      path: page.targetPath,
      seo: {
        title,
        description,
      },
      puckData: {
        root: {},
        content: baseContent,
      },
    };
  });

  return {
    projectId: `site-${crypto.randomUUID()}`,
    branding: {
      name: extracted.siteName,
      logo: extracted.logo,
      colors: {
        primary: dominantColor,
        accent: accentColor,
      },
      style: {
        borderRadius: "sm",
        typography: "Inter",
      },
    },
    pages: projectPages,
  };
}

export function extractFirstHttpUrl(input: string) {
  const m = input.match(/https?:\/\/[^\s]+|(?:www\.[^\s]+)/i);
  return m?.[0];
}
