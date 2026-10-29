import { promptGeneratorPage } from "../../../content/pages/prompt-generator";

const quickPrompts = [
  'photoreal portrait, cinematic rim light, 85mm lens, studio detail',
  'premium product render, floating object, soft shadow, clean backdrop',
  'campaign key visual, dramatic light shafts, editorial framing, motion energy',
] as const;

export function PromptGeneratorSurface() {
  return (
    <section className="container section-stack">
      <article className="section-card">
        <p className="eyebrow">Prompt Generator</p>
        <h2>{promptGeneratorPage.title}</h2>
        <p>{promptGeneratorPage.lead}</p>
      </article>
      <div className="tool-panel-grid">
        <article className="section-card control-stack">
          <div className="prompt-box">
            <div className="control-row"><span className="control-label">Idea</span><span className="control-value">Public prompt ideation</span></div>
            <textarea defaultValue="Editorial portrait of a ceramic astronaut with indigo atmosphere and strong rim light." />
            <div className="token-list">
              {quickPrompts.map((item) => <span key={item} className="token-pill">{item}</span>)}
            </div>
          </div>
          <div className="hero-actions">
            <a href="/app/generate" className="button-primary">Send to generator</a>
            <a href="/pricing" className="button-secondary">View pricing</a>
          </div>
        </article>
        <article className="section-card">
          <h2>Prompt shaping guide</h2>
          <p>Use the public prompt route to structure subject, medium, lighting, lens, composition, and style modifiers before handing off to the real workspace.</p>
        </article>
      </div>
    </section>
  );
}
