import { fluxAiPage } from "../../content/pages/flux-ai";

export default function MarketingRoutePage() {
  return (
    <div className="page-shell">
      <section className="hero-block container">
        <p className="eyebrow">FLUX AI</p>
        <h1>{fluxAiPage.title}</h1>
        <p className="lead">{fluxAiPage.lead}</p>
        <div className="hero-actions">
          <a href="/app/generate" className="button-primary">Open generator</a>
          <a href="/pricing" className="button-secondary">View pricing</a>
        </div>
      </section>
    </div>
  );
}
