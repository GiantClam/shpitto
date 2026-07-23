import { signUpPage } from "../../content/pages/sign-up";

export default function MarketingRoutePage() {
  return (
    <div className="page-shell">
      <section className="hero-block container">
        <p className="eyebrow">Sign Up</p>
        <h1>{signUpPage.title}</h1>
        <p className="lead">{signUpPage.lead}</p>
        <div className="hero-actions">
          <a href="/sign-in" className="button-primary">Continue to sign in</a>
          <a href="/app" className="button-secondary">Open app hub</a>
        </div>
      </section>
    </div>
  );
}
