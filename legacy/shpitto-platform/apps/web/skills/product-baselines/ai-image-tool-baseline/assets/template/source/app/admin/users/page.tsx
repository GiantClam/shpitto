import { redirect } from "next/navigation";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../lib/auth";
import { getCmsUsers } from "../../../lib/cms";
import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";

export default async function CmsUsersPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/admin/users');
  if (!isTemplateAdmin(user)) redirect('/app?admin=required');
  const data = await getCmsUsers();
  return (
    <div className="page-shell">
      <CmsShell active="users" title="User management" lead="Review accounts, plans, credit balances, and access status from the administrator CMS." source={data.source}>
        <div className="cms-toolbar"><span className="cms-source">Source: {data.source}</span><span className="cms-source">{data.items.length} accounts</span></div>
        <div className="cms-project-grid">
          {data.items.map((item) => <article key={item.id} className="cms-panel cms-project-card"><div className="cms-project-card__top"><span className="token-pill">{item.status}</span><span className="cms-source">{item.updatedAt}</span></div><h2>{item.name}</h2><p>{item.email}</p><div className="cms-project-card__stats"><span><strong>{item.plan}</strong> plan</span><span><strong>{item.credits}</strong> credits</span></div><div className="dashboard-card__footer"><span className="dashboard-card__meta">Account: {item.id}</span><span className="cms-source">Admin review</span></div></article>)}
        </div>
      </CmsShell>
    </div>
  );
}
