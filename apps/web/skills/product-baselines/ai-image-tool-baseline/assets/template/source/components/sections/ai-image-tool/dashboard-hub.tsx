import { getAppPage } from "../../../content/pages/app";
import { getTemplateSessionUser } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/billing-store";
import { getCurrentLocale } from "../../../lib/i18n";

export async function DashboardHub() {
  const dashboardPage = await getAppPage();
  const user = await getTemplateSessionUser();
  const entitlement = user ? await getEntitlement(user.id) : null;
  const locale = await getCurrentLocale();
  const dashboardLinks = locale === 'fr'
    ? [
        { href: '/app/generate', title: 'Generer', body: 'Ouvrez l espace complet de prompt avec controles modele, uploads et sortie rejouable.' },
        { href: '/app/history', title: 'Historique', body: 'Revenez aux sorties precedentes, rejouez les prompts et comparez les executions sans quitter l app.' },
        { href: '/app/giftcode', title: 'Code cadeau', body: 'Activez des codes et credits bonus dans le tableau de bord produit.' },
        { href: '/app/order', title: 'Commandes', body: 'Consultez plans, credits et etat des commandes sans repasser par le marketing.' },
      ]
    : [
        { href: '/app/generate', title: 'Generate', body: 'Open the full prompt workspace with model controls, uploads, and replayable output.' },
        { href: '/app/history', title: 'History', body: 'Return to prior outputs, replay prompts, and compare runs without leaving the app shell.' },
        { href: '/app/giftcode', title: 'GiftCode', body: 'Redeem codes and bonus credits inside the product-owned dashboard.' },
        { href: '/app/order', title: 'ChargeOrder', body: 'Review plans, credits, and order state without routing through the marketing site.' },
      ];
  return (
    <section className="container section-stack">
      <div className="app-shell">
        <div className="app-shell__header">
          <div className="app-shell__title">
            <p className="eyebrow">{locale === "fr" ? "Coque app" : "App shell"}</p>
            <h1>{dashboardPage.title}</h1>
            <p>{dashboardPage.lead}</p>
          </div>
          <article className="dashboard-card">
            <p className="eyebrow">Current account</p>
            <h2>{user?.name || "Creator"}</h2>
            <p>{user?.email || "Signed-in account"}</p>
            <div className="dashboard-card__footer"><span className="dashboard-card__meta">Your generations, history, credits, and orders stay scoped to this account.</span><a href="/app/history" className="button-secondary">Manage my data</a></div>
          </article>
          <a href="/app/generate" className="button-primary">{locale === "fr" ? "Generer" : "Generate"}</a>
        </div>
        <div className="dashboard-kpis">
          <div className="dashboard-kpi"><strong>{entitlement?.credits || 0}</strong><span className="control-value">{locale === "fr" ? "credits disponibles" : "credits available"}</span></div>
          <div className="dashboard-kpi"><strong>FLUX.1</strong><span className="control-value">{locale === "fr" ? "modele actif" : "active model"}</span></div>
          <div className="dashboard-kpi"><strong>24h</strong><span className="control-value">{locale === "fr" ? "historique rejouable" : "replayable history"}</span></div>
        </div>
        <div className="dashboard-grid">
          <div className="dashboard-stack">
            {dashboardLinks.slice(0, 2).map((item) => (
              <article key={item.href} className="dashboard-card">
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                <div className="dashboard-card__footer">
                  <span className="dashboard-card__meta">{locale === "fr" ? "Entree produit" : "Product-owned route"}</span>
                  <a href={item.href} className="button-primary">{locale === "fr" ? "Ouvrir" : "Open route"}</a>
                </div>
              </article>
            ))}
          </div>
          <div className="dashboard-stack">
            {dashboardLinks.slice(2).map((item) => (
              <article key={item.href} className="dashboard-list__item">
                <h3 style={{ margin: "0 0 8px" }}>{item.title}</h3>
                <p>{item.body}</p>
                <div className="dashboard-card__footer">
                  <span className="dashboard-card__meta">{locale === "fr" ? "Operations" : "Operations"}</span>
                  <a href={item.href} className="button-secondary">{locale === "fr" ? "Voir" : "View"}</a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
