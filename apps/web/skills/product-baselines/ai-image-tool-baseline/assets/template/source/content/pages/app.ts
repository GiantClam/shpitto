import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedAppPage = {
  title: createLocalizedValue('Use the product hub to jump into generation, history, gift codes, or billing.', 'Utilisez le hub produit pour aller vers generation, historique, codes cadeau ou facturation.'),
  lead: createLocalizedValue('The app shell should act like a real product dashboard, not just a second marketing page.', 'La coque applicative doit se comporter comme un vrai tableau de bord produit, pas comme une seconde page marketing.'),
} as const;

export async function getAppPage() {
  const locale = await getCurrentLocale();
  return {
    title: resolveLocalizedValue(localizedAppPage.title, locale),
    lead: resolveLocalizedValue(localizedAppPage.lead, locale),
  };
}
