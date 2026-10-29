import { redirect } from "next/navigation";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../lib/auth";
import { getCmsAssets } from "../../../lib/cms";
import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";

export default async function CmsAssetsPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/admin/assets');
  if (!isTemplateAdmin(user)) redirect('/app?admin=required');
  const data = await getCmsAssets();
  return (
    <div className="page-shell">
      <CmsShell active="assets" title="Generated asset library" lead="Review approved and pending outputs with project links, alt text, and publish readiness before they leave the product." source={data.source}>
        <div className="cms-toolbar"><span className="cms-source">Source: {data.source}</span><a href="/app/history" className="button-secondary">Open history</a></div>
        <div className="cms-asset-grid">
          {data.items.map((asset) => <article key={asset.id} className="history-card cms-asset-card"><div className="history-thumb checkerboard"><span className="apple-tag history-thumb__tag">{asset.kind}</span></div><div className="history-meta"><div className="cms-project-card__top"><span className={"cms-status cms-status--" + asset.status}>{asset.status}</span><span className="cms-source">{asset.updatedAt}</span></div><h2>{asset.title}</h2><p>{asset.altText}</p><small>{asset.project} · Payload collection: Media</small><div className="hero-actions"><a href="/app/history" className="button-secondary">Open history</a><a href="/admin/settings" className="button-secondary">SEO settings</a></div></div></article>)}
        </div>
      </CmsShell>
    </div>
  );
}
