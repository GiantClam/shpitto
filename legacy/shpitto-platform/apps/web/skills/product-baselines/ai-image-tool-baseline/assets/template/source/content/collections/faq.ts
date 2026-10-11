import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";

const localizedFaq = [
  {
    question: createLocalizedValue('Is this only a landing page?', 'Est-ce seulement une landing page ?'),
    answer: createLocalizedValue('No. The baseline includes a public shell, an authenticated app surface, billing entry, history, and a CMS entry route.', 'Non. La base inclut une coque publique, une surface applicative authentifiee, un point d entree de facturation, l historique et une route d entree CMS.'),
  },
  {
    question: createLocalizedValue('Can this connect to real providers?', 'Peut-on connecter de vrais fournisseurs ?'),
    answer: createLocalizedValue('Yes. The template is prepared for provider-backed model execution, CMS configuration, and deployment workflows.', 'Oui. Le template est prepare pour une execution reelle des modeles, une configuration CMS et des workflows de deploiement.'),
  },
  {
    question: createLocalizedValue('Can skills change theme, layout, and pages?', 'Les skills peuvent-ils changer le theme, la mise en page et les pages ?'),
    answer: createLocalizedValue('Yes. The template is intended as a skill-driven baseline for theme, shell, route, content, SEO, and publishing changes.', 'Oui. Le template est pense comme une base pilotee par skills pour modifier theme, coque, routes, contenu, SEO et publication.'),
  },
] as const;

export async function getFaq() {
  const locale = await getCurrentLocale();
  return localizedFaq.map((item) => ({
    question: resolveLocalizedValue(item.question, locale),
    answer: resolveLocalizedValue(item.answer, locale),
  }));
}
