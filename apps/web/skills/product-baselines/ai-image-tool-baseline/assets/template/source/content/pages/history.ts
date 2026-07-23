import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedHistoryPage = {
  title: createLocalizedValue('Review generated images, replay prompts, and reopen prior work without going back through marketing copy.', 'Consultez les images generees, rejouez les prompts et rouvrez le travail precedent sans repasser par le marketing.'),
  lead: createLocalizedValue('This route is product-owned. It should help users inspect earlier outputs, compare variants, and reopen work without routing them back through marketing copy.', 'Cette route appartient au produit. Elle doit aider les utilisateurs a inspecter les sorties precedentes, comparer les variantes et rouvrir le travail sans les renvoyer vers le marketing.'),
} as const;

export async function getHistoryPage() {
  const locale = await getCurrentLocale();
  return {
    title: resolveLocalizedValue(localizedHistoryPage.title, locale),
    lead: resolveLocalizedValue(localizedHistoryPage.lead, locale),
  };
}
