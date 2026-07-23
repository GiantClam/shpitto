import { redirect } from "next/navigation";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../lib/auth";
import { getCmsProjects } from "../../../lib/cms";
import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";

export default async function CmsProjectsPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/admin/projects');
  if (!isTemplateAdmin(user)) redirect('/app?admin=required');
  const data = await getCmsProjects();
  return (
    <div className="page-shell">
      <CmsShell active="projects" title="Projects and prompt systems" lead="Keep reusable prompts, references, output groups, and delivery notes organized as low-frequency product metadata." source={data.source}>
        <div className="cms-toolbar"><span className="cms-source">Source: {data.source}</span><a href="/flux-prompt-generator" className="button-primary">Create prompt system</a></div>
        <div className="cms-project-grid">
          {data.items.map((project) => <article key={project.id} className="cms-panel cms-project-card"><div className="cms-project-card__top"><span className="token-pill">{project.updatedAt}</span><span className="cms-source">{project.id}</span></div><h2>{project.name}</h2><p>{project.summary}</p><div className="cms-project-card__stats"><span><strong>{project.promptCount}</strong> prompts</span><span><strong>{project.assetCount}</strong> assets</span></div><div className="dashboard-card__footer"><span className="dashboard-card__meta">Payload collection: Projects</span><a href="/admin/assets" className="button-secondary">View assets</a></div></article>)}
        </div>
      </CmsShell>
    </div>
  );
}
