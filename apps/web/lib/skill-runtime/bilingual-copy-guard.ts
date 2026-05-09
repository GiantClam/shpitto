function htmlVisibleText(html: string) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBilingualRequirementText(text = ""): boolean {
  return /(?:\bbilingual\b|EN\s*\/\s*ZH|ZH\s*\/\s*EN|language\s+switch|multi-?language|\u53cc\u8bed|\u4e2d\u82f1|\u4e2d\u6587.{0,12}\u82f1\u6587|\u82f1\u6587.{0,12}\u4e2d\u6587|\u591a\u8bed\u8a00|\u8bed\u8a00.{0,8}\u5207\u6362)/i.test(
    String(text || ""),
  );
}

function cjkCount(text: string): number {
  return (String(text || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function latinContentWords(text: string): string[] {
  const ignoredTokens = new Set([
    "ai",
    "api",
    "bays",
    "blog",
    "css",
    "cto",
    "devops",
    "en",
    "english",
    "hellotalk",
    "html",
    "js",
    "json",
    "k12",
    "min",
    "rss",
    "saas",
    "seo",
    "ui",
    "url",
    "ux",
    "wechat",
    "wong",
    "zh",
    "chinese",
  ]);
  return (String(text || "").match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
    .filter((word) => !ignoredTokens.has(word.toLowerCase()));
}

function latinLetterCount(text: string): number {
  return latinContentWords(text).join("").length;
}

function hasSubstantialCjkAndLatin(text: string): boolean {
  const source = String(text || "");
  const words = latinContentWords(source);
  return cjkCount(source) >= 4 && (words.length >= 5 || latinLetterCount(source) >= 36);
}

function normalizeBilingualLeakSample(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function isExplicitBilingualPairSample(text: string): boolean {
  const source = String(text || "");
  return cjkCount(source) >= 2 && latinContentWords(source).length >= 1 && /[\/|()（）]/.test(source);
}

export function findVisibleSimultaneousBilingualCopy(html: string): string[] {
  const text = htmlVisibleText(html);
  if (!text || (!hasSubstantialCjkAndLatin(text) && !isExplicitBilingualPairSample(text))) return [];

  const samples = new Set<string>();
  const compact = text.replace(/\s+/g, " ").trim();
  const patterns = [
    /[\u3400-\u9fff][^\/。！？?!\n]{1,90}\s*\/\s*[A-Za-z][^\/。！？?!\n]{2,90}/g,
    /[A-Za-z][^\/。！？?!\n]{2,90}\s*\/\s*[\u3400-\u9fff][^\/。！？?!\n]{1,90}/g,
    /[\u3400-\u9fff][^。！？?]{4,160}[。！？?]\s+[A-Z][A-Za-z][^。！？?]{12,220}/g,
    /[A-Z][A-Za-z][^。！？?]{12,220}[.!?]\s+[\u3400-\u9fff][^。！？?]{4,160}/g,
  ];

  for (const pattern of patterns) {
    for (const match of compact.matchAll(pattern)) {
      const sample = normalizeBilingualLeakSample(match[0] || "");
      if (sample && (hasSubstantialCjkAndLatin(sample) || isExplicitBilingualPairSample(sample))) {
        samples.add(sample);
      }
      if (samples.size >= 5) break;
    }
    if (samples.size >= 5) break;
  }

  return Array.from(samples);
}

function decodeHtmlText(text: string): string {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isLanguageToggleLabel(text: string): boolean {
  return /^(中文|英文|汉语|英语|zh|zh-cn|en|english|chinese|切换语言|language|language switch)$/i.test(
    String(text || "").trim(),
  );
}

function isSubstantialBilingualDomPair(zhText: string, enText: string): boolean {
  const zh = decodeHtmlText(zhText);
  const en = decodeHtmlText(enText);
  if (!zh || !en) return false;
  if (isLanguageToggleLabel(zh) || isLanguageToggleLabel(en)) return false;
  return cjkCount(zh) >= 2 && (latinContentWords(en).length >= 2 || en.length >= 12);
}

export function findDuplicatedBilingualDomCopy(html: string): string[] {
  const source = String(html || "");
  if (!/lang-(?:zh|zh-cn)/i.test(source) || !/lang-en/i.test(source)) return [];

  const samples = new Set<string>();
  const pattern =
    /<span\b[^>]*class=["'][^"']*\blang-(?:zh|zh-cn)\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<span\b[^>]*class=["'][^"']*\blang-en\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  for (const match of source.matchAll(pattern)) {
    const zh = decodeHtmlText(match[1] || "");
    const en = decodeHtmlText(match[2] || "");
    if (!isSubstantialBilingualDomPair(zh, en)) continue;
    samples.add(normalizeBilingualLeakSample(`${zh} <> ${en}`));
    if (samples.size >= 5) break;
  }

  return Array.from(samples);
}
