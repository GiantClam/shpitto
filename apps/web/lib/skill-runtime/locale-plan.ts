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
  { pattern: /\b(?:zh-cn|zh)\b|中文|汉语|Chinese/gi, locale: "zh-CN" },
  { pattern: /\b(?:en-us|en-gb|en)\b|英文|英语|English/gi, locale: "en" },
  { pattern: /\b(?:ja-jp|ja)\b|日文|日语|Japanese/gi, locale: "ja" },
  { pattern: /\b(?:ko-kr|ko)\b|韩文|韩语|Korean/gi, locale: "ko" },
  { pattern: /\b(?:fr-fr|fr)\b|法文|法语|French/gi, locale: "fr" },
  { pattern: /\b(?:de-de|de)\b|德文|德语|German/gi, locale: "de" },
  { pattern: /\b(?:es-es|es)\b|西班牙文|西班牙语|Spanish/gi, locale: "es" },
  { pattern: /\b(?:pt-br|pt-pt|pt)\b|葡萄牙文|葡萄牙语|Portuguese/gi, locale: "pt-BR" },
  { pattern: /\b(?:it-it|it)\b|意大利文|意大利语|Italian/gi, locale: "it" },
  { pattern: /\b(?:ar-sa|ar)\b|阿拉伯文|阿拉伯语|Arabic/gi, locale: "ar" },
  { pattern: /\b(?:ru-ru|ru)\b|俄文|俄语|Russian/gi, locale: "ru" },
];

function cjkCount(text: string): number {
  return (String(text || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function normalizeLocaleCode(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  for (const entry of LOCALE_NAME_MAP) {
    if (entry.pattern.test(raw)) return entry.locale;
  }
  const canonical = raw.replace(/_/g, "-");
  if (/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(canonical)) {
    if (/^zh(?:-|$)/i.test(canonical)) return "zh-CN";
    if (/^en(?:-|$)/i.test(canonical)) return "en";
    const parts = canonical.split("-");
    return parts.length === 1 ? parts[0].toLowerCase() : `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }
  return null;
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
      /(?:supported\s+languages?|supported\s+locales?|languages?|locales?|语种|语言)\s*[:：]\s*([^\n]+)/gi,
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
  for (const entry of LOCALE_NAME_MAP) {
    if (entry.pattern.test(source)) locales.push(entry.locale);
  }
  for (const match of source.matchAll(/\b[a-z]{2,3}(?:-[A-Za-z]{2,4})?\b/g)) {
    const normalized = normalizeLocaleCode(match[0] || "");
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
    /default (?:visible )?language (?:is|:)\s*(?:Chinese|zh-CN|zh)\b|defaultLocale["']?\s*[:=]\s*["']?zh(?:-CN)?["']?|Chinese-first|Chinese-source|中文优先|默认中文|默认可见语言.*中文/i.test(
      source,
    )
  ) {
    return "zh-CN";
  }
  if (
    /default (?:visible )?language (?:is|:)\s*(?:English|en)\b|defaultLocale["']?\s*[:=]\s*["']?en["']?|English-first|默认英文|默认可见语言.*英文/i.test(
      source,
    )
  ) {
    return "en";
  }
  if (fallback === "zh-CN" || fallback === "en") return fallback;
  return cjkCount(source) >= 4 ? "zh-CN" : "en";
}

function hasBilingualSignal(text: string): boolean {
  return /(?:\bbilingual\b|中英双语|双语|language\s+switch)/i.test(String(text || ""));
}

function hasMultilingualSignal(text: string): boolean {
  return /(?:\bmultilingual\b|多语言|多语种|internationalization|translation[-\s]driven|translation pipeline|dozens?\s+of\s+languages?|tens?\s+of\s+languages?|多达\d+种语言|\d+\s+(?:languages|locales))/i.test(
    String(text || ""),
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
