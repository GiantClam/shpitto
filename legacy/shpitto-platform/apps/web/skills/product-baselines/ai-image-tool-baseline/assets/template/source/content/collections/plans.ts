import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedPlans = [
  {
    name: createLocalizedValue('Free', 'Gratuit'),
    price: '$0',
    interval: createLocalizedValue('/forever', '/a vie'),
    summary: createLocalizedValue('Public entry point with free generation framing, basic model access, and history visibility.', 'Point d entree public avec cadre gratuit, acces modele basique et visibilite sur l historique.'),
  },
  {
    name: 'Pro',
    price: '$15',
    interval: '/mo',
    summary: createLocalizedValue('For repeat creators who need higher quality runs, reusable prompt workflows, and cleaner export paths.', 'Pour les createurs reguliers qui ont besoin de rendus de meilleure qualite, de workflows de prompts reutilisables et d exports plus propres.'),
  },
  {
    name: createLocalizedValue('Business', 'Business'),
    price: '$30',
    interval: '/mo',
    summary: createLocalizedValue('For teams that need stronger throughput, history reuse, and product-level publishing extensions.', 'Pour les equipes qui ont besoin d un debit plus eleve, de reutilisation d historique et d extensions de publication au niveau produit.'),
  },
] as const;

export async function getPlans() {
  const locale = await getCurrentLocale();
  return localizedPlans.map((plan) => ({
    name: resolveLocalizedValue(plan.name, locale),
    price: plan.price,
    interval: resolveLocalizedValue(plan.interval, locale),
    summary: resolveLocalizedValue(plan.summary, locale),
  }));
}
