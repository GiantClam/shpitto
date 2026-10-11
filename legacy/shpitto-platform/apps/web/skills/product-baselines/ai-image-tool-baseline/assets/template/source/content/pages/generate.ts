import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedGeneratePage = {
  title: createLocalizedValue('Generate with prompt input, model selection, private mode, uploads, and replayable output controls.', 'Generez avec saisie de prompt, selection de modele, mode prive, uploads et controles de sortie rejouables.'),
  lead: createLocalizedValue('This route mirrors the upstream generator more closely: prompt entry, model picker, aspect ratio, privacy toggle, upload slot, and a live result stack.', 'Cette route se rapproche du generateur amont : saisie du prompt, choix du modele, ratio, option de confidentialite, zone d upload et pile de resultats en direct.'),
} as const;

export async function getGeneratePage() {
  const locale = await getCurrentLocale();
  return {
    title: resolveLocalizedValue(localizedGeneratePage.title, locale),
    lead: resolveLocalizedValue(localizedGeneratePage.lead, locale),
  };
}
