import { getSignInPage } from "../../../content/pages/sign-in";
import { getTemplateAuthMode } from "../../../lib/auth";
import { getDictionary } from "../../../lib/i18n";
import { AuthForm } from "../../auth/auth-form";

export async function SignInGate() {
  const authMode = getTemplateAuthMode();
  const dictionary = await getDictionary();
  const signInPage = await getSignInPage();
  return (
    <section className="container section-stack">
      <div className="auth-shell">
        <article className="dashboard-card auth-shell__panel">
          <div className="app-shell__title">
            <p className="eyebrow eyebrow--gradient"><span className="eyebrow__emoji">🎉</span><span className="text-gradient_indigo-purple">Authentication</span></p>
            <h1>{signInPage.title}</h1>
            <p>{signInPage.lead}</p>
          </div>
          {authMode === "google" ? <p className="auth-hint">{dictionary.authGoogleReady}</p> : null}
          {authMode === "preview-credentials" ? <p className="auth-hint">{dictionary.authPreviewFallback}</p> : null}
          {authMode === "unconfigured" ? <p className="auth-hint">{dictionary.authUnconfigured}</p> : null}
          <AuthForm mode={authMode} dictionary={dictionary} />
        </article>
        <aside className="dashboard-card auth-shell__preview">
          <div className="hero-preview-bar"><span>{dictionary.aiImageTemplate}</span><span>FLUX.1</span></div>
          <div className="auth-shell__preview-visual checkerboard" />
          <div className="auth-benefit-list">
            <article className="auth-benefit"><h3>Secure access</h3><p>Sign-in protects the generator while public routes still explain product value and pricing.</p></article>
            <article className="auth-benefit"><h3>Workspace entry</h3><p>Successful login drops users into the product hub, then directly into generation and history.</p></article>
            <article className="auth-benefit"><h3>Product-owned flow</h3><p>Authentication, app routes, and billing stay inside the template instead of leaking back into marketing copy.</p></article>
          </div>
        </aside>
      </div>
    </section>
  );
}
