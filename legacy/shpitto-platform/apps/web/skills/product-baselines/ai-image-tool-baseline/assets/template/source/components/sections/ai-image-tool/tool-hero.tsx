import { SignedIn, SignedOut } from "../../auth/auth-components";
import { getHomePage } from "../../../content/pages/home";

export async function ToolHero() {
  const homePage = await getHomePage();
  return (
    <section className="hero-block container">
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow eyebrow--gradient"><span className="eyebrow__emoji">🎉</span><span className="text-gradient_indigo-purple">{homePage.eyebrow}</span></p>
          <h1 className="hero-title">{homePage.title}</h1>
          <p className="lead">{homePage.lead}</p>
          <div className="hero-actions">
            <SignedIn><a href="/app/generate" className="button-primary">{homePage.primaryCta}</a></SignedIn>
            <SignedOut><a href="/sign-in" className="button-primary">{homePage.signInCta}</a></SignedOut>
            <a href="/flux-prompt-generator" className="button-secondary">{homePage.secondaryCta}</a>
            <a href="/pricing" className="button-secondary">{homePage.pricingCta}</a>
          </div>
          <p className="hero-note">Open-source FLUX.1 image generation with fast login, pricing, and product-owned app routes.</p>
          <div className="stats-grid" style={{ marginTop: "28px" }}>
            <div className="stat-card"><strong>FLUX.1</strong><span className="control-value">{homePage.eyebrow}</span></div>
            <div className="stat-card"><strong>Replay</strong><span className="control-value">{homePage.secondaryCta}</span></div>
            <div className="stat-card"><strong>Free</strong><span className="control-value">{homePage.primaryCta}</span></div>
          </div>
        </div>
        <aside className="hero-preview">
          <div className="hero-preview-bar"><span>{homePage.secondaryCta}</span><span>FLUX.1</span></div>
          <div className="hero-preview-stage checkerboard">
            <div className="hero-preview-stage__art" />
            <span className="hero-preview-stage__caption apple-tag">{homePage.lead}</span>
          </div>
          <div className="hero-preview-gallery">
            <div className="preview-thumb"><span className="apple-tag">{homePage.primaryCta}</span></div>
            <div className="preview-thumb"><span className="apple-tag">{homePage.secondaryCta}</span></div>
            <div className="preview-thumb"><span className="apple-tag">{homePage.eyebrow}</span></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
