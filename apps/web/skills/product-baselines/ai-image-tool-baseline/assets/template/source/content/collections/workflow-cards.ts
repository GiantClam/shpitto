import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedWorkflowCards = [
  {
    title: createLocalizedValue('Pick a prompt path', 'Choisir un chemin de prompt'),
    body: createLocalizedValue('Start from the public prompt generator or jump directly into the authenticated generation workspace.', 'Commencez par le generateur de prompts public ou entrez directement dans l espace de generation authentifie.'),
  },
  {
    title: createLocalizedValue('Generate and review', 'Generer et verifier'),
    body: createLocalizedValue('Run model presets, inspect outputs, and keep replayable history tied to the app shell.', 'Lancez des presets de modele, inspectez les resultats et conservez un historique rejouable lie a la coque applicative.'),
  },
  {
    title: createLocalizedValue('Publish and operate', 'Publier et operer'),
    body: createLocalizedValue('Manage billing, low-frequency CMS controls, SEO, and deployment readiness from the same template foundation.', 'Gerez facturation, controles CMS basse frequence, SEO et capacite de deploiement depuis la meme base de template.'),
  },
] as const;

export async function getWorkflowCards() {
  const locale = await getCurrentLocale();
  return localizedWorkflowCards.map((item) => ({
    title: resolveLocalizedValue(item.title, locale),
    body: resolveLocalizedValue(item.body, locale),
  }));
}
