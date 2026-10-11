import type { DesignStylePreset } from "../design-style-preset.ts";
import { DEFAULT_STYLE_PRESET } from "../design-style-preset.ts";
import { DEFAULT_AUTH_NEXT_PATH, safeAuthNextPath } from "./next-path.ts";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const SAFE_THEME_URL_RE = /^(?:https?:\/\/|\/|data:image\/)/i;

export type AuthTheme = {
  brandName?: string;
  logo?: string;
  mode?: "light" | "dark";
  typography?: string;
  colors?: {
    primary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    panel?: string;
    text?: string;
    muted?: string;
    border?: string;
  };
};

function firstValue(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function asText(value: unknown, fallback = ""): string {
  const next = typeof value === "string" ? value.trim() : "";
  return next ? next.slice(0, 240) : fallback;
}

function asHex(value: unknown, fallback = ""): string {
  const next = typeof value === "string" ? value.trim() : "";
  return HEX_COLOR_RE.test(next) ? next.toUpperCase() : fallback;
}

function asLogo(value: unknown): string | undefined {
  const next = asText(value, "");
  if (!next) return undefined;
  if (/^(?:javascript|vbscript):/i.test(next)) return undefined;
  return SAFE_THEME_URL_RE.test(next) ? next.slice(0, 2048) : undefined;
}

function sanitizeThemeColors(value: unknown): NonNullable<AuthTheme["colors"]> {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    primary: asHex(source.primary, DEFAULT_STYLE_PRESET.colors.primary),
    accent: asHex(source.accent, DEFAULT_STYLE_PRESET.colors.accent),
    background: asHex(source.background, DEFAULT_STYLE_PRESET.colors.background),
    surface: asHex(source.surface, DEFAULT_STYLE_PRESET.colors.surface),
    panel: asHex(source.panel, DEFAULT_STYLE_PRESET.colors.panel),
    text: asHex(source.text, DEFAULT_STYLE_PRESET.colors.text),
    muted: asHex(source.muted, DEFAULT_STYLE_PRESET.colors.muted),
    border: asHex(source.border, DEFAULT_STYLE_PRESET.colors.border),
  };
}

function hasThemeValue(theme: AuthTheme): boolean {
  return Boolean(
    theme.brandName ||
      theme.logo ||
      theme.typography ||
      theme.mode ||
      Object.values(theme.colors || {}).some(Boolean),
  );
}

export function serializeAuthTheme(theme?: AuthTheme | null): string {
  if (!theme || !hasThemeValue(theme)) return "";
  return JSON.stringify(theme);
}

export function safeAuthTheme(value: string | string[] | null | undefined): AuthTheme | undefined {
  const raw = firstValue(value);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const theme: AuthTheme = {
      brandName: asText(parsed.brandName, ""),
      logo: asLogo(parsed.logo),
      mode: parsed.mode === "dark" ? "dark" : parsed.mode === "light" ? "light" : undefined,
      typography: asText(parsed.typography, ""),
      colors: sanitizeThemeColors(parsed.colors),
    };

    return hasThemeValue(theme) ? theme : undefined;
  } catch {
    return undefined;
  }
}

export function buildAuthThemeFromStylePreset(
  stylePreset?: Partial<DesignStylePreset> | null,
  branding?: { name?: string; logo?: string } | null,
): AuthTheme {
  const colors: DesignStylePreset["colors"] = stylePreset?.colors
    ? {
        ...DEFAULT_STYLE_PRESET.colors,
        ...stylePreset.colors,
      }
    : DEFAULT_STYLE_PRESET.colors;
  const theme: AuthTheme = {
    brandName: asText(branding?.name, "Shpitto"),
    logo: asLogo(branding?.logo),
    mode: stylePreset?.mode === "dark" ? "dark" : "light",
    typography: asText(stylePreset?.typography, DEFAULT_STYLE_PRESET.typography),
    colors: {
      primary: asHex(colors.primary, DEFAULT_STYLE_PRESET.colors.primary),
      accent: asHex(colors.accent, DEFAULT_STYLE_PRESET.colors.accent),
      background: asHex(colors.background, DEFAULT_STYLE_PRESET.colors.background),
      surface: asHex(colors.surface, DEFAULT_STYLE_PRESET.colors.surface),
      panel: asHex(colors.panel, DEFAULT_STYLE_PRESET.colors.panel),
      text: asHex(colors.text, DEFAULT_STYLE_PRESET.colors.text),
      muted: asHex(colors.muted, DEFAULT_STYLE_PRESET.colors.muted),
      border: asHex(colors.border, DEFAULT_STYLE_PRESET.colors.border),
    },
  };

  return theme;
}

export function withAuthQueryPath(pathname: string, params: Record<string, string | undefined>): string {
  const url = new URL(pathname, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    const safeValue = String(value || "").trim();
    if (safeValue) {
      url.searchParams.set(key, safeValue);
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withAuthThemePath(
  pathname: string,
  nextPath: string,
  theme?: AuthTheme | null,
  fallback = DEFAULT_AUTH_NEXT_PATH,
  extraParams?: Record<string, string | undefined>,
): string {
  const next = safeAuthNextPath(nextPath, fallback);
  return withAuthQueryPath(pathname, {
    next: next === fallback ? undefined : next,
    theme: serializeAuthTheme(theme),
    ...extraParams,
  });
}
