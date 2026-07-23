import { kreaAlternativePage } from "../../content/pages/krea-alternative";

export default function MarketingRoutePage() {
  return (
    <div className="page-shell">
      <section className="hero-block container">
        <p className="eyebrow">Krea Alternative</p>
        <h1>{kreaAlternativePage.title}</h1>
        <p className="lead">{kreaAlternativePage.lead}</p>
        <div className="hero-actions">
          <a href="/app/generate" className="button-primary">Open workspace</a>
          <a href="/flux-prompt-generator" className="button-secondary">Use prompt generator</a>
        </div>
      </section>
    </div>
  );
}
