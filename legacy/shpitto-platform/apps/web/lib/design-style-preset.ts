export type StyleMode = "light" | "dark";
export type BorderRadiusScale = "none" | "sm" | "md" | "lg";
export type NavVariant = "underline" | "pill";
export type HeaderVariant = "glass" | "solid";
export type FooterVariant = "light" | "dark";
export type ButtonVariant = "solid" | "outline";
export type HeroThemeVariant = "dark" | "light" | "glass";
export type HeroEffectVariant = "none" | "retro-grid";

export type DesignStylePreset = {
  mode: StyleMode;
  typography: string;
  borderRadius: BorderRadiusScale;
  navVariant: NavVariant;
  headerVariant: HeaderVariant;
  footerVariant: FooterVariant;
  buttonVariant: ButtonVariant;
  heroTheme: HeroThemeVariant;
  heroEffect: HeroEffectVariant;
  navLabelMaxChars: number;
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    panel: string;
    text: string;
    muted: string;
    border: string;
  };
};

export const DEFAULT_STYLE_PRESET: DesignStylePreset = {
  mode: "light",
  typography: "\"Space Grotesk\", \"IBM Plex Sans\", system-ui, -apple-system, sans-serif",
  borderRadius: "md",
  navVariant: "pill",
  headerVariant: "glass",
  footerVariant: "dark",
  buttonVariant: "solid",
  heroTheme: "dark",
  heroEffect: "none",
  navLabelMaxChars: 12,
  colors: {
    primary: "#2563EB",
    accent: "#22C55E",
    background: "#FFFFFF",
    surface: "#F8FAFC",
    panel: "#FFFFFF",
    text: "#0F172A",
    muted: "#475569",
    border: "#E2E8F0",
  },
};

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

const asHex = (value: unknown, fallback: string): string => {
  const next = typeof value === "string" ? value.trim() : "";
  return HEX_COLOR_RE.test(next) ? next.toUpperCase() : fallback;
};

const asEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const asInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return Math.max(6, Math.min(18, rounded));
};

export function normalizeStylePreset(
  input: Partial<DesignStylePreset> | null | undefined,
  colorsFallback?: Partial<{ primary: string; accent: string }>,
): DesignStylePreset {
  const source: Partial<DesignStylePreset> = input || {};
  const sourceColors: Partial<DesignStylePreset["colors"]> = source.colors || {};

  const primary = asHex(sourceColors.primary || colorsFallback?.primary, DEFAULT_STYLE_PRESET.colors.primary);
  const accent = asHex(sourceColors.accent || colorsFallback?.accent, DEFAULT_STYLE_PRESET.colors.accent);

  return {
    mode: asEnum(source.mode, ["light", "dark"], DEFAULT_STYLE_PRESET.mode),
    typography:
      typeof source.typography === "string" && source.typography.trim()
        ? source.typography.trim()
        : DEFAULT_STYLE_PRESET.typography,
    borderRadius: asEnum(source.borderRadius, ["none", "sm", "md", "lg"], DEFAULT_STYLE_PRESET.borderRadius),
    navVariant: asEnum(source.navVariant, ["underline", "pill"], DEFAULT_STYLE_PRESET.navVariant),
    headerVariant: asEnum(source.headerVariant, ["glass", "solid"], DEFAULT_STYLE_PRESET.headerVariant),
    footerVariant: asEnum(source.footerVariant, ["light", "dark"], DEFAULT_STYLE_PRESET.footerVariant),
    buttonVariant: asEnum(source.buttonVariant, ["solid", "outline"], DEFAULT_STYLE_PRESET.buttonVariant),
    heroTheme: asEnum(source.heroTheme, ["dark", "light", "glass"], DEFAULT_STYLE_PRESET.heroTheme),
    heroEffect: asEnum(source.heroEffect, ["none", "retro-grid"], DEFAULT_STYLE_PRESET.heroEffect),
    navLabelMaxChars: asInt(source.navLabelMaxChars, DEFAULT_STYLE_PRESET.navLabelMaxChars),
    colors: {
      primary,
      accent,
      background: asHex(sourceColors.background, DEFAULT_STYLE_PRESET.colors.background),
      surface: asHex(sourceColors.surface, DEFAULT_STYLE_PRESET.colors.surface),
      panel: asHex(sourceColors.panel, DEFAULT_STYLE_PRESET.colors.panel),
      text: asHex(sourceColors.text, DEFAULT_STYLE_PRESET.colors.text),
      muted: asHex(sourceColors.muted, DEFAULT_STYLE_PRESET.colors.muted),
      border: asHex(sourceColors.border, DEFAULT_STYLE_PRESET.colors.border),
    },
  };
}

export function resolveStylePresetFromProject(projectJson: any, branding?: any): DesignStylePreset {
  const candidate =
    projectJson?.skillHit?.style_preset ||
    projectJson?.skill_hit?.style_preset ||
    projectJson?.stylePreset ||
    projectJson?.style_preset;
  const colorsFallback = {
    primary: branding?.colors?.primary,
    accent: branding?.colors?.accent,
  };
  return normalizeStylePreset(candidate, colorsFallback);
}

const toSafeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function truncateLabel(label: string, maxChars = DEFAULT_STYLE_PRESET.navLabelMaxChars): string {
  const text = label.trim();
  if (!text) return text;
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return chars.slice(0, maxChars).join("");
}

export function inferNavLabel(page: any, maxChars = DEFAULT_STYLE_PRESET.navLabelMaxChars): string {
  const explicit = toSafeString(page?.navLabel) || toSafeString(page?.seo?.navLabel) || toSafeString(page?.seo?.menuLabel);
  if (explicit) return truncateLabel(explicit, maxChars);

  const path = toSafeString(page?.path);
  const mapped: Record<string, string> = {
    "/": "首页",
    "/company": "公司",
    "/products": "产品",
    "/news": "资讯",
    "/cases": "案例",
    "/contact": "联系",
  };
  if (mapped[path]) return truncateLabel(mapped[path], maxChars);

  const seoTitle = toSafeString(page?.seo?.title);
  if (seoTitle) {
    const concise = seoTitle
      .split(/[|\-–—]/)[0]
      .replace(/\s+/g, " ")
      .trim();
    if (concise) return truncateLabel(concise, maxChars);
  }

  if (path === "/") return "Home";
  const segment = path.replace(/^\/+/, "").split("/")[0] || "Page";
  return truncateLabel(segment.charAt(0).toUpperCase() + segment.slice(1), maxChars);
}

