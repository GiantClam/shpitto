import { fluxSchnellPage } from "../../content/pages/flux-schnell";

export default function MarketingRoutePage() {
  return (
    <div className="page-shell">
      <section className="hero-block container">
        <p className="eyebrow">FLUX Schnell</p>
        <h1>{fluxSchnellPage.title}</h1>
        <p className="lead">{fluxSchnellPage.lead}</p>
        <div className="hero-actions">
          <a href="/app/generate" className="button-primary">Try schnell</a>
          <a href="/flux-ai" className="button-secondary">Compare FLUX.1</a>
        </div>
      </section>
    </div>
  );
}
