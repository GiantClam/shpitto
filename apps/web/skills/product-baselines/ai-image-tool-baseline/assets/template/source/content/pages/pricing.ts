import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedPricingPage = {
  title: createLocalizedValue('Pricing that supports product usage, not just page decoration.', 'Une tarification qui soutient l usage produit, pas seulement l habillage de page.'),
  lead: createLocalizedValue('Use pricing as part of the product system: credits, plans, and order handling should align with the authenticated app shell and CMS operations.', 'Utilisez la tarification comme partie du systeme produit : credits, plans et gestion des commandes doivent s aligner avec la coque applicative authentifiee et les operations CMS.'),
} as const;

export async function getPricingPage() {
  const locale = await getCurrentLocale();
  return {
    title: resolveLocalizedValue(localizedPricingPage.title, locale),
    lead: resolveLocalizedValue(localizedPricingPage.lead, locale),
  };
}
