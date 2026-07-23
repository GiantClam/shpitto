import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedOrderPage = {
  title: createLocalizedValue('Review product credits and order state inside the app shell.', 'Consultez les credits produit et l etat des commandes dans la coque applicative.'),
  lead: createLocalizedValue('Order and billing actions remain app-owned surfaces so the user can manage credits without going through the marketing site.', 'Les actions de commande et de facturation restent des surfaces produit afin que l utilisateur gere ses credits sans passer par le site marketing.'),
} as const;

export async function getOrderPage() {
  const locale = await getCurrentLocale();
  return {
    title: resolveLocalizedValue(localizedOrderPage.title, locale),
    lead: resolveLocalizedValue(localizedOrderPage.lead, locale),
  };
}
