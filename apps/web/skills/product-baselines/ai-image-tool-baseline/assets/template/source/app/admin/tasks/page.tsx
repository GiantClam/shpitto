import { redirect } from "next/navigation";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../lib/auth";
import { getCmsTasks } from "../../../lib/cms";
import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";

export default async function CmsTasksPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/admin/tasks');
  if (!isTemplateAdmin(user)) redirect('/app?admin=required');
  const data = await getCmsTasks();
  return (
    <div className="page-shell">
      <CmsShell active="tasks" title="Generation tasks" lead="Track processing, attention-required, and ready-to-deliver work. High-frequency task state remains owned by the product task service." source={data.source}>
        <div className="cms-toolbar"><span className="cms-source">Source: {data.source}</span><a href="/app/generate" className="button-primary">New task</a></div>
        <div className="cms-table">
          <div className="cms-table__head"><span>Task</span><span>Project</span><span>Model</span><span>Status</span><span>Updated</span></div>
          {data.items.map((task) => <a key={task.id} href="/app/history" className="cms-table__row"><span><strong>{task.title}</strong><small>{task.id} · {task.outputCount} outputs</small></span><span>{task.project}</span><span>{task.model}</span><span className={"cms-status cms-status--" + task.status}>{task.status}</span><span>{task.updatedAt}</span></a>)}
        </div>
        <div className="cms-note"><strong>Task service boundary</strong><span>Configure PRODUCT_API_URL to read real task state. Payload is intentionally not used as a high-frequency queue store.</span></div>
      </CmsShell>
    </div>
  );
}
