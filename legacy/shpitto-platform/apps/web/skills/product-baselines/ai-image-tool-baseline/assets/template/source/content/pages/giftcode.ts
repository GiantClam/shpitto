import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedGiftCodePage = {
  title: createLocalizedValue('Redeem a gift code or promo code without leaving the app shell.', 'Activez un code cadeau ou promotionnel sans quitter la coque applicative.'),
  lead: createLocalizedValue('This route belongs to the product dashboard and keeps reward redemption separate from public marketing pages.', 'Cette route appartient au tableau de bord produit et garde l activation des recompenses separee des pages marketing publiques.'),
} as const;

export async function getGiftCodePage() {
  const locale = await getCurrentLocale();
  return {
    title: resolveLocalizedValue(localizedGiftCodePage.title, locale),
    lead: resolveLocalizedValue(localizedGiftCodePage.lead, locale),
  };
}
