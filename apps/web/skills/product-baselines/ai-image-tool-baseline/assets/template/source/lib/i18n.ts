import { cookies } from "next/headers";
import { site } from "../content/site";

export const LOCALE_COOKIE_NAME = 'shpitto-locale';

export type TemplateLocale = typeof site.supportedLocales[number];

const dictionaries = {
  en: {
    cms: 'CMS',
    signIn: 'Sign in',
    aiImageTemplate: 'AI image template',
    footerPreparedBy: 'baseline prepared by Shpitto.',
    authGoogleReady: 'Original FluxKrea-style auth is active. Use Google sign-in to enter the workspace.',
    authPreviewFallback: 'Google keys are not configured, so the local preview falls back to a development-only sign-in.',
    authUnconfigured: 'No runtime auth provider is available yet. Configure Google OAuth for production use.',
    authGoogleHint: 'This template uses the original Google-based sign-in flow when OAuth credentials are configured.',
    authContinueWithGoogle: 'Continue with Google',
    authPreviewHint: 'Preview fallback only. Any email plus a password of at least 6 characters will open the local template workspace when Google OAuth is not configured.',
    authPreviewSubmit: 'Open preview workspace',
    authSigningIn: 'Signing in...',
    authBackHome: 'Back to homepage',
    authMisconfigured: 'Authentication is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for the original sign-in flow, or enable local preview credentials in development only.',
  },
  fr: {
    cms: 'CMS',
    signIn: 'Connexion',
    aiImageTemplate: 'Modele image IA',
    footerPreparedBy: 'base preparee par Shpitto.',
    authGoogleReady: 'L auth FluxKrea d origine est active. Utilisez Google pour entrer dans l espace de travail.',
    authPreviewFallback: 'Les cles Google ne sont pas configurees, donc l apercu local utilise une connexion reservee au developpement.',
    authUnconfigured: 'Aucun fournisseur d authentification n est configure. Ajoutez Google OAuth pour un usage de production.',
    authGoogleHint: 'Ce modele utilise le flux de connexion Google d origine lorsque les identifiants OAuth sont configures.',
    authContinueWithGoogle: 'Continuer avec Google',
    authPreviewHint: 'Apercu uniquement. Une adresse email et un mot de passe d au moins 6 caracteres ouvrent l espace local quand Google OAuth n est pas configure.',
    authPreviewSubmit: 'Ouvrir l apercu',
    authSigningIn: 'Connexion en cours...',
    authBackHome: 'Retour a l accueil',
    authMisconfigured: 'L authentification n est pas configuree. Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET pour le flux d origine, ou activez le mode apercu en developpement uniquement.',
  },
} as const;

export type TemplateDictionary = (typeof dictionaries)[TemplateLocale];

export function isSupportedLocale(value: string): value is TemplateLocale {
  return (site.supportedLocales as readonly string[]).includes(value);
}

export async function getCurrentLocale(): Promise<TemplateLocale> {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && isSupportedLocale(cookieLocale)) return cookieLocale;
  return site.defaultLocale;
}

export async function getDictionary(locale?: TemplateLocale): Promise<TemplateDictionary> {
  const resolved = locale || (await getCurrentLocale());
  return dictionaries[resolved];
}

export async function setCurrentLocale(locale: string) {
  if (!isSupportedLocale(locale)) return false;
  const store = await cookies();
  store.set(LOCALE_COOKIE_NAME, locale, { path: '/', sameSite: 'lax' });
  return true;
}

export function createLocalizedValue<T>(en: T, fr: T) {
  return { en, fr } as const;
}

export function resolveLocalizedValue<T>(value: T | { en: T; fr: T }, locale: TemplateLocale): T {
  if (value && typeof value === 'object' && 'en' in (value as Record<string, unknown>) && 'fr' in (value as Record<string, unknown>)) {
    return (value as { en: T; fr: T })[locale];
  }
  return value as T;
}
