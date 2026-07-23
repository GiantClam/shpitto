import { redirect } from "next/navigation";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../lib/auth";
import { getCmsSettings } from "../../../lib/cms";
import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";

export default async function CmsSettingsPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/admin/settings');
  if (!isTemplateAdmin(user)) redirect('/app?admin=required');
  const data = await getCmsSettings();
  return (
    <div className="page-shell">
      <CmsShell active="settings" title="Operational settings" lead="Keep low-frequency globals and configuration close to the product shell while secrets remain in environment variables or a secret manager." source={data.source}>
        <div className="cms-settings-grid">
          <article className="cms-panel"><p className="eyebrow">Site settings</p><h2>{data.settings.siteName}</h2><p>Payload global: SiteSettings. Navigation, brand copy, SEO defaults, and publish metadata are controlled here.</p><div className="dashboard-card__footer"><span className="cms-source">Configured globally</span><a href={data.settings.payloadAdminUrl || "/admin/settings"} className="button-secondary">Open editor</a></div></article>
          <article className="cms-panel"><p className="eyebrow">Generation settings</p><h2>{data.settings.defaultModel}</h2><p>Enabled providers: {data.settings.enabledProviders.join(", ")}.</p><div className="dashboard-card__footer"><span className="cms-source">Payload global: GenerationSettings</span><a href="/app/generate" className="button-secondary">Open generator</a></div></article>
          <article className="cms-panel"><p className="eyebrow">Billing rules</p><h2>{data.settings.billingMode}</h2><p>Pricing plans, credit packs, entitlements, and provider toggles stay aligned with ChargeOrder and gift-code flows.</p><div className="dashboard-card__footer"><span className="cms-source">Payload global: BillingSettings</span><a href="/app/order" className="button-secondary">Open billing</a></div></article>
          <article className="cms-panel"><p className="eyebrow">SEO and publish</p><h2>{data.settings.seoStatus}</h2><p>Review canonical metadata, alt text, social image references, and release readiness before publishing an approved asset.</p><div className="dashboard-card__footer"><span className="cms-source">Payload global: SeoSettings</span><a href="/admin/assets" className="button-secondary">Review assets</a></div></article>
        </div>
        <div className="cms-note"><strong>Secret boundary</strong><span>Provider keys, webhook secrets, and payment credentials are never stored in Payload content fields. Set PAYLOAD_API_URL, PAYLOAD_API_KEY, and PAYLOAD_ADMIN_URL on the server.</span></div>
      </CmsShell>
    </div>
  );
}
