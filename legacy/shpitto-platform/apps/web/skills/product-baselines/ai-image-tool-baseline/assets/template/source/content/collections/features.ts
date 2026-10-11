import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedFeatures = [
  {
    title: createLocalizedValue('Public discovery routes', 'Parcours public de decouverte'),
    body: createLocalizedValue('Keep marketing, pricing, prompt ideation, and SEO pages open while the generation workspace remains product-owned.', 'Gardez marketing, tarifs, ideation de prompts et pages SEO ouverts pendant que l espace de generation reste controle par le produit.'),
  },
  {
    title: createLocalizedValue('Gated generation workspace', 'Espace de generation protege'),
    body: createLocalizedValue('Move authenticated users into a dedicated app shell with generation, history, billing, and CMS entry kept separate from promotional copy.', 'Faites entrer les utilisateurs authentifies dans une coque applicative dediee avec generation, historique, facturation et entree CMS separes du discours promotionnel.'),
  },
  {
    title: createLocalizedValue('Template-ready operations', 'Operations pretes pour le template'),
    body: createLocalizedValue('This baseline is prepared for payload-backed settings, provider configs, publishing flows, and skill-driven website edits.', 'Cette base est preparee pour des reglages pilotes par Payload, des configurations fournisseurs, des flux de publication et des editions de site pilotees par skill.'),
  },
] as const;

export async function getFeatures() {
  const locale = await getCurrentLocale();
  return localizedFeatures.map((feature) => ({
    title: resolveLocalizedValue(feature.title, locale),
    body: resolveLocalizedValue(feature.body, locale),
  }));
}
