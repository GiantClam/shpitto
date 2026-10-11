export function extractHtmlLang(html: string): string {
  const match = String(html || "").match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
  return String(match?.[1] || "").trim();
}

export function hasDistinctTranslatedLocaleResources(enRaw: string, zhRaw: string): boolean {
  return collectSharedDistinctLocaleKeys(enRaw, zhRaw).length > 0;
}

export function collectSharedDistinctLocaleKeys(enRaw: string, zhRaw: string): string[] {
  try {
    const en = JSON.parse(String(enRaw || "{}"));
    const zh = JSON.parse(String(zhRaw || "{}"));
    return Object.keys(en)
      .filter((key) => typeof zh?.[key] === "string" && typeof en?.[key] === "string")
      .filter((key) => String(en[key]).trim() && String(zh[key]).trim() && String(en[key]) !== String(zh[key]))
      .sort();
  } catch {
    return [];
  }
}

export function hasBlogNavLink(html: string): boolean {
  return /<nav\b[\s\S]*?\bhref=["']\/blog\/?["']/i.test(String(html || ""));
}

export function hasConsultationForm(html: string): boolean {
  const source = String(html || "");
  if (!/<form\b/i.test(source)) return false;
  return /name=/i.test(source) && /email/i.test(source) && /(organization|company)/i.test(source) && /(message|textarea)/i.test(source);
}

export function hasDuplicateFooterLinkGroups(html: string): boolean {
  const footerMatch = String(html || "").match(/<footer\b[\s\S]*?<\/footer>/i);
  const footer = String(footerMatch?.[0] || "");
  const groups = Array.from(footer.matchAll(/<div\b[^>]*class=["'][^"']*footer-links[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi))
    .map((match) =>
      Array.from(String(match[1] || "").matchAll(/\bhref=["']([^"']+)["']/gi))
        .map((hrefMatch) => String(hrefMatch[1] || "").trim())
        .filter(Boolean)
        .sort()
        .join("|"),
    )
    .filter((group) => group.split("|").filter(Boolean).length >= 3);
  return new Set(groups).size !== groups.length;
}
