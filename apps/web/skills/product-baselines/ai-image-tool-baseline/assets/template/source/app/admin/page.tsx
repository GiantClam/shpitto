import { redirect } from "next/navigation";
import { getTemplateSessionUser, isTemplateAdmin } from "../../lib/auth";
import { getCmsOverview } from "../../lib/cms";
import { CmsShell } from "../../components/sections/ai-image-tool/cms-shell";

export default async function CmsPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/admin');
  if (!isTemplateAdmin(user)) redirect('/app?admin=required');
  const overview = await getCmsOverview();
  return (
    <div className="page-shell">
      <CmsShell active="overview" title="Administrator control center" lead="Manage users, generation tasks, projects, assets, billing, and product settings from the administrator CMS." source={overview.source}>
        <div className="cms-kpi-grid">
          <div className="cms-kpi"><strong>{overview.users.items.length}</strong><span>managed user accounts</span></div>
          <div className="cms-kpi"><strong>{overview.tasks.items.length}</strong><span>tracked generation tasks</span></div>
          <div className="cms-kpi"><strong>{overview.projects.items.length}</strong><span>saved projects and prompt systems</span></div>
          <div className="cms-kpi"><strong>{overview.assets.items.length}</strong><span>managed output assets</span></div>
          <div className="cms-kpi"><strong>{overview.settings.settings.enabledProviders.length}</strong><span>enabled model providers</span></div>
        </div>
        <div className="cms-content-grid">
          <article className="cms-panel">
            <div className="cms-panel__header"><div><p className="eyebrow">Task queue</p><h2>Recent work</h2></div><a href="/admin/tasks" className="button-secondary">View all tasks</a></div>
            <div className="cms-list">
              {overview.tasks.items.slice(0, 3).map((task) => <a key={task.id} href="/admin/tasks" className="cms-list__row"><span><strong>{task.title}</strong><small>{task.project} · {task.model} · {task.updatedAt}</small></span><span className={"cms-status cms-status--" + task.status}>{task.status}</span></a>)}
            </div>
          </article>
          <article className="cms-panel">
            <div className="cms-panel__header"><div><p className="eyebrow">Asset library</p><h2>Recent outputs</h2></div><a href="/admin/assets" className="button-secondary">Manage assets</a></div>
            <div className="cms-list">
              {overview.assets.items.slice(0, 3).map((asset) => <a key={asset.id} href="/admin/assets" className="cms-list__row"><span><strong>{asset.title}</strong><small>{asset.kind} · {asset.project} · {asset.updatedAt}</small></span><span className={"cms-status cms-status--" + asset.status}>{asset.status}</span></a>)}
            </div>
          </article>
        </div>
        <div className="cms-action-grid">
          <a href="/admin/projects" className="cms-action-card"><strong>Organize projects</strong><span>Group prompts, references, outputs, and publish checklists by campaign or client.</span></a>
          <a href="/admin/users" className="cms-action-card"><strong>Manage users</strong><span>Review account status, plans, credit balances, and administrator access.</span></a>
          <a href="/admin/settings" className="cms-action-card"><strong>Review settings</strong><span>Check Payload globals, provider profiles, billing rules, and SEO readiness before publishing.</span></a>
          <a href="/app/generate" className="cms-action-card cms-action-card--accent"><strong>Start a generation</strong><span>Create a new task and keep its output connected to history and the asset library.</span></a>
        </div>
      </CmsShell>
    </div>
  );
}
