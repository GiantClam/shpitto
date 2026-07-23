import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedHomePage = {
  eyebrow: createLocalizedValue('FLUX.1 image generation', 'Generation d images FLUX.1'),
  title: createLocalizedValue('Free FLUX.1 image generation in AI Image Studio, with a real product shell instead of a marketing-only starter.', 'Generation d images FLUX.1 gratuite dans AI Image Studio, avec une vraie coque produit plutot qu un simple starter marketing.'),
  lead: createLocalizedValue('This baseline follows the fluxkreafree shape: public discovery pages, a prompt generator, a gated generation workspace, replayable history, and product-owned app routes.', 'Cette base suit la structure fluxkreafree : pages publiques de decouverte, generateur de prompts, espace de generation protege, historique rejouable et routes applicatives pilotees par le produit.'),
  primaryCta: createLocalizedValue('Start generating', 'Commencer a generer'),
  secondaryCta: createLocalizedValue('Prompt generator', 'Generateur de prompts'),
  signInCta: createLocalizedValue('Sign in to generate', 'Se connecter pour generer'),
  pricingCta: createLocalizedValue('Pricing', 'Tarifs'),
} as const;

export async function getHomePage() {
  const locale = await getCurrentLocale();
  return {
    eyebrow: resolveLocalizedValue(localizedHomePage.eyebrow, locale),
    title: resolveLocalizedValue(localizedHomePage.title, locale),
    lead: resolveLocalizedValue(localizedHomePage.lead, locale),
    primaryCta: resolveLocalizedValue(localizedHomePage.primaryCta, locale),
    secondaryCta: resolveLocalizedValue(localizedHomePage.secondaryCta, locale),
    signInCta: resolveLocalizedValue(localizedHomePage.signInCta, locale),
    pricingCta: resolveLocalizedValue(localizedHomePage.pricingCta, locale),
  };
}
