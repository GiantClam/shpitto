import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedExamples = [
  {
    title: createLocalizedValue('Editorial portrait workflow', 'Workflow portrait editorial'),
    body: createLocalizedValue('Prompt-led portrait generation with replay history and workspace continuity.', 'Generation de portrait pilotee par prompt avec historique rejouable et continuite de l espace de travail.'),
  },
  {
    title: createLocalizedValue('Product render workflow', 'Workflow rendu produit'),
    body: createLocalizedValue('Structured product visuals staged through the generator, pricing, and export surfaces.', 'Visuels produit structures, passes par le generateur, les surfaces tarifaires et l export.'),
  },
  {
    title: createLocalizedValue('Campaign key visual workflow', 'Workflow visuel cle de campagne'),
    body: createLocalizedValue('Public discovery routes lead into authenticated production for repeatable campaign imagery.', 'Les routes publiques de decouverte mènent vers une production authentifiee pour des visuels de campagne repetables.'),
  },
] as const;

export async function getExamples() {
  const locale = await getCurrentLocale();
  return localizedExamples.map((item) => ({
    title: resolveLocalizedValue(item.title, locale),
    body: resolveLocalizedValue(item.body, locale),
  }));
}
