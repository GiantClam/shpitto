import { getGiftCodePage } from "../../../content/pages/giftcode";
import { getCurrentLocale } from "../../../lib/i18n";
import { GiftCodeForm } from "./gift-code-form";

export async function GiftCodePanel() {
  const giftCodePage = await getGiftCodePage();
  const locale = await getCurrentLocale();
  return (
    <section className="container section-stack">
      <div className="app-shell__header">
        <div className="app-shell__title">
          <p className="eyebrow">{locale === "fr" ? "Code cadeau" : "Gift code"}</p>
          <h1>{giftCodePage.title}</h1>
          <p>{giftCodePage.lead}</p>
        </div>
      </div>
      <div className="dashboard-grid dashboard-grid--compact">
        <article className="dashboard-card control-stack">
          <div className="prompt-box">
            <div className="control-row"><span className="control-label">{locale === "fr" ? "Code cadeau" : "Gift code"}</span><span className="control-value">{locale === "fr" ? "Activer dans l app" : "Redeem inside app"}</span></div>
            <GiftCodeForm />
          </div>
        </article>
        <article className="dashboard-card">
          <h2>{locale === "fr" ? "Les recompenses restent pilotees par le produit" : "Reward handling stays product-owned"}</h2>
          <p>{locale === "fr" ? "L activation des codes cadeau reste dans le tableau de bord, separee de la tarification et des pages publiques d acquisition." : "Gift code redemption belongs inside the dashboard, separate from pricing copy and public acquisition pages."}</p>
        </article>
      </div>
    </section>
  );
}
