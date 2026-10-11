export const I18N_MESSAGE_EN_PATH = "/i18n/messages.en.json";
export const I18N_MESSAGE_ZH_CN_PATH = "/i18n/messages.zh-CN.json";
export const I18N_LOCALE_REGISTRY_PATH = "/i18n/locales.json";

export type LocalePlanMode = "single" | "bilingual" | "multilingual";

export type LocalePlan = {
  mode: LocalePlanMode;
  defaultLocale: "zh-CN" | "en";
  locales: string[];
  translationDriven: boolean;
  sourceCatalogPath: string;
  registryPath: string;
};

const LOCALE_NAME_MAP: Array<{ pattern: RegExp; locale: string }> = [
  { pattern: /\b(?:zh-cn|zh)\b|\u4e2d\u6587|\u6c49\u8bed|Chinese/i, locale: "zh-CN" },
  { pattern: /\b(?:en-us|en-gb|en)\b|\u82f1\u6587|\u82f1\u8bed|English/i, locale: "en" },
  { pattern: /\b(?:ja-jp|ja)\b|\u65e5\u6587|\u65e5\u8bed|Japanese/i, locale: "ja" },
  { pattern: /\b(?:ko-kr|ko)\b|\u97e9\u6587|\u97e9\u8bed|Korean/i, locale: "ko" },
  { pattern: /\b(?:fr-fr|fr)\b|\u6cd5\u6587|\u6cd5\u8bed|French/i, locale: "fr" },
  { pattern: /\b(?:de-de|de)\b|\u5fb7\u6587|\u5fb7\u8bed|German/i, locale: "de" },
  { pattern: /\b(?:es-es|es)\b|\u897f\u73ed\u7259\u6587|\u897f\u73ed\u7259\u8bed|Spanish/i, locale: "es" },
  { pattern: /\b(?:pt-br|pt-pt|pt)\b|\u8461\u8404\u7259\u6587|\u8461\u8404\u7259\u8bed|Portuguese/i, locale: "pt-BR" },
  { pattern: /\b(?:it-it|it)\b|\u610f\u5927\u5229\u6587|\u610f\u5927\u5229\u8bed|Italian/i, locale: "it" },
  { pattern: /\b(?:ar-sa|ar)\b|\u963f\u62c9\u4f2f\u6587|\u963f\u62c9\u4f2f\u8bed|Arabic/i, locale: "ar" },
  { pattern: /\b(?:ru-ru|ru)\b|\u4fc4\u6587|\u4fc4\u8bed|Russian/i, locale: "ru" },
];

const LOOSE_LANGUAGE_NAME_MAP: Array<{ pattern: RegExp; locale: string }> = [
  { pattern: /Chinese/i, locale: "zh-CN" },
  { pattern: /English/i, locale: "en" },
  { pattern: /Japanese/i, locale: "ja" },
  { pattern: /Korean/i, locale: "ko" },
  { pattern: /French/i, locale: "fr" },
  { pattern: /German/i, locale: "de" },
  { pattern: /Spanish/i, locale: "es" },
  { pattern: /Portuguese/i, locale: "pt-BR" },
  { pattern: /Italian/i, locale: "it" },
  { pattern: /Arabic/i, locale: "ar" },
  { pattern: /Russian/i, locale: "ru" },
];

const SUPPORTED_LOCALE_BASES = new Set([
  "zh",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ar",
  "ru",
  "nl",
  "pl",
  "tr",
  "sv",
  "da",
  "fi",
  "no",
  "cs",
  "hu",
  "ro",
  "uk",
  "vi",
  "th",
  "id",
  "ms",
  "hi",
]);

const AMBIGUOUS_LOCALE_STOPWORDS = new Set([
  "an",
  "as",
  "at",
  "be",
  "by",
  "do",
  "go",
  "he",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "no",
  "of",
  "on",
  "or",
  "so",
  "to",
  "up",
  "us",
  "we",
]);

function cjkCount(text: string): number {
  return (String(text || "").match(/[\u3400-\u9fff]/g) || []).length;
}

export function normalizeLocaleCode(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  for (const entry of LOCALE_NAME_MAP) {
    if (entry.pattern.test(raw)) return entry.locale;
  }
  const canonical = raw.replace(/_/g, "-");
  if (/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(canonical)) {
    const parts = canonical.split("-");
    const base = parts[0].toLowerCase();
    if (!SUPPORTED_LOCALE_BASES.has(base)) return null;
    if (base === "zh") return "zh-CN";
    if (base === "en") return "en";
    return parts.length === 1 ? base : `${base}-${parts[1].toUpperCase()}`;
  }
  return null;
}

export function normalizeLocaleList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return uniqueLocales(values.map((item) => String(item || "")));
}

function extractJsonLocaleList(text: string): string[] {
  const matches = Array.from(
    String(text || "").matchAll(
      /"(?:locales|supportedLocales|languages|languageList)"\s*:\s*\[([^\]]+)\]/gi,
    ),
  );
  const locales: string[] = [];
  for (const match of matches) {
    for (const quoted of String(match[1] || "").matchAll(/"([^"]+)"/g)) {
      const normalized = normalizeLocaleCode(quoted[1] || "");
      if (normalized) locales.push(normalized);
    }
  }
  return locales;
}

function extractInlineLocaleList(text: string): string[] {
  const locales: string[] = [];
  const source = String(text || "");
  const listMatches = Array.from(
    source.matchAll(
      /(?:supported\s+languages?|supported\s+locales?|languages?|locales?|\u8bed\u79cd|\u8bed\u8a00)\s*[:\uff1a]\s*([^\n]+)/gi,
    ),
  );
  for (const match of listMatches) {
    const segment = String(match[1] || "");
    for (const token of segment.split(/[,\u3001/|;]+/g)) {
      const normalized = normalizeLocaleCode(token);
      if (normalized) locales.push(normalized);
    }
  }
  return locales;
}

function extractLooseLocaleMentions(text: string): string[] {
  const locales: string[] = [];
  const source = String(text || "");
  for (const entry of LOOSE_LANGUAGE_NAME_MAP) {
    if (entry.pattern.test(source)) locales.push(entry.locale);
  }
  for (const match of source.matchAll(/\b[a-z]{2,3}(?:-[A-Za-z]{2,4})?\b/g)) {
    const token = String(match[0] || "").trim().toLowerCase();
    if (AMBIGUOUS_LOCALE_STOPWORDS.has(token)) continue;
    const normalized = normalizeLocaleCode(token);
    if (normalized) locales.push(normalized);
  }
  return locales;
}

function uniqueLocales(locales: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const locale of locales) {
    const normalized = normalizeLocaleCode(locale);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function defaultVisibleLocale(text: string, fallbackLocale?: string): "zh-CN" | "en" {
  const source = String(text || "");
  const fallback = normalizeLocaleCode(String(fallbackLocale || ""));
  if (
    /default (?:visible )?language (?:is|:)\s*(?:Chinese|zh-CN|zh)\b|defaultLocale["']?\s*[:=]\s*["']?zh(?:-CN)?["']?|Chinese-first|Chinese-source|\u4e2d\u6587\u4f18\u5148|\u9ed8\u8ba4\u4e2d\u6587|\u9ed8\u8ba4\u53ef\u89c1\u8bed\u8a00.*\u4e2d\u6587/i.test(
      source,
    )
  ) {
    return "zh-CN";
  }
  if (
    /default (?:visible )?language (?:is|:)\s*(?:English|en)\b|defaultLocale["']?\s*[:=]\s*["']?en["']?|English-first|\u9ed8\u8ba4\u82f1\u6587|\u9ed8\u8ba4\u53ef\u89c1\u8bed\u8a00.*\u82f1\u6587/i.test(
      source,
    )
  ) {
    return "en";
  }
  if (fallback === "zh-CN" || fallback === "en") return fallback;
  return cjkCount(source) >= 4 ? "zh-CN" : "en";
}

function hasBilingualSignal(text: string): boolean {
  return /(?:\bbilingual\b|\u4e2d\u82f1\u53cc\u8bed|\u82f1\u4e2d\u53cc\u8bed|\u53cc\u8bed|language\s+switch|\u8bed\u8a00\u5207\u6362)/i.test(
    String(text || ""),
  );
}

function hasMultilingualSignal(text: string): boolean {
  const source = String(text || "");
  const withoutNegatedMentions = source.replace(
    /\b(?:not|no|without|avoid(?:ing)?|does\s+not|do\s+not|should\s+not|remain(?:s)?|stays?)\b[^.\n]{0,80}\bmultilingual\b/gi,
    "",
  );
  return /(?:\bmultilingual\b|\u591a\u8bed\u8a00|\u591a\u8bed\u79cd|internationalization|translation[-\s]driven|translation pipeline|dozens?\s+of\s+languages?|tens?\s+of\s+languages?|\u591a\u8fbe\d+\u79cd\u8bed\u8a00|\d+\s+(?:languages|locales))/i.test(
    withoutNegatedMentions,
  );
}

export function getLocaleMessagePath(locale: string): string {
  const normalized = normalizeLocaleCode(locale) || "en";
  return `/i18n/messages.${normalized}.json`;
}

export function buildLocalePlan(requirementText: string, fallbackLocale?: string): LocalePlan {
  const defaultLocale = defaultVisibleLocale(requirementText, fallbackLocale);
  const explicitLocales = uniqueLocales([
    ...extractJsonLocaleList(requirementText),
    ...extractInlineLocaleList(requirementText),
    ...extractLooseLocaleMentions(requirementText),
  ]);
  const locales = uniqueLocales(
    explicitLocales.length > 0
      ? explicitLocales
      : hasBilingualSignal(requirementText)
        ? [defaultLocale, defaultLocale === "zh-CN" ? "en" : "zh-CN"]
        : [defaultLocale],
  );
  const localeCountSignalMatch = String(requirementText || "").match(/\b(\d+)\s+(?:languages|locales)\b/i);
  const localeCountSignal = Number(localeCountSignalMatch?.[1] || 0);
  const multilingual =
    locales.length >= 3 ||
    hasMultilingualSignal(requirementText) ||
    localeCountSignal >= 3;
  const bilingual = !multilingual && (locales.length === 2 || hasBilingualSignal(requirementText));
  const finalLocales = multilingual
    ? uniqueLocales(locales.length >= 2 ? locales : [defaultLocale, defaultLocale === "zh-CN" ? "en" : "zh-CN"])
    : bilingual
      ? uniqueLocales(locales.length >= 2 ? locales : [defaultLocale, defaultLocale === "zh-CN" ? "en" : "zh-CN"])
      : [defaultLocale];
  return {
    mode: multilingual ? "multilingual" : bilingual ? "bilingual" : "single",
    defaultLocale,
    locales: finalLocales,
    translationDriven: multilingual,
    sourceCatalogPath: getLocaleMessagePath(defaultLocale),
    registryPath: I18N_LOCALE_REGISTRY_PATH,
  };
}
