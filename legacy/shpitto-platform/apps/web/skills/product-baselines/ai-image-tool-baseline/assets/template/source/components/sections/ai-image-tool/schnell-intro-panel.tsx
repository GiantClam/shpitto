import { fluxSchnellPage } from "../../../content/pages/flux-schnell";

export function SchnellIntroPanel() {
  return (
    <section className="container section-stack">
      <article className="section-card spotlight-card">
        <div>
          <p className="eyebrow">FLUX Schnell</p>
          <h2>{fluxSchnellPage.title}</h2>
          <p>{fluxSchnellPage.lead}</p>
          <div className="hero-actions">
            <a href="/flux-schnell" className="button-primary">View schnell</a>
            <a href="/flux-ai" className="button-secondary">Compare FLUX.1</a>
          </div>
        </div>
        <div className="spotlight-visual" />
      </article>
    </section>
  );
}
