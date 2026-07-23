import { getOrderPage } from "../../../content/pages/order";
import { getCurrentLocale } from "../../../lib/i18n";
import { getTemplateSessionUser } from "../../../lib/auth";
import { getEntitlement, listChargeOrders } from "../../../lib/billing-store";
import { CheckoutButton } from "./checkout-button";

export async function OrderPanel() {
  const orderPage = await getOrderPage();
  const locale = await getCurrentLocale();
  const user = await getTemplateSessionUser();
  const entitlement = user ? await getEntitlement(user.id) : null;
  const orders = user ? await listChargeOrders(user.id) : [];
  return (
    <section className="container section-stack">
      <div className="app-shell__header">
        <div className="app-shell__title">
          <p className="eyebrow">{locale === "fr" ? "Commandes" : "ChargeOrder"}</p>
          <h1>{orderPage.title}</h1>
          <p>{orderPage.lead}</p>
        </div>
      </div>
      <div className="card-grid">
        {[{ title: locale === "fr" ? "Solde de credits" : "Credits balance", body: `${entitlement?.credits || 0} ${locale === "fr" ? "credits disponibles" : "credits available"}.` }, { title: locale === "fr" ? "Dernieres commandes" : "Recent orders", body: orders.length ? orders.map((item) => `${item.id.slice(0, 8)} · ${item.status} · ${item.creditAmount} credits`).join(" | ") : "No orders yet." }].map((item) => (
          <article key={item.title} className="dashboard-card">
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <div className="hero-actions"><CheckoutButton label={locale === "fr" ? "Acheter des credits" : "Buy credits"} /></div>
    </section>
  );
}
