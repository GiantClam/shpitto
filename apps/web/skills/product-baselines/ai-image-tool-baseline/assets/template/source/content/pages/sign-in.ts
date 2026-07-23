import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedSignInPage = {
  title: createLocalizedValue('Sign in to enter the product workspace.', 'Connectez-vous pour entrer dans l espace produit.'),
  lead: createLocalizedValue('Public discovery stays open, while generation, billing, CMS, and user history stay gated behind product-owned authentication.', 'La decouverte publique reste ouverte, tandis que generation, facturation, CMS et historique utilisateur restent derriere une authentification controlee par le produit.'),
} as const;

export async function getSignInPage() {
  const locale = await getCurrentLocale();
  return {
    title: resolveLocalizedValue(localizedSignInPage.title, locale),
    lead: resolveLocalizedValue(localizedSignInPage.lead, locale),
  };
}
