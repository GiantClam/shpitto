import { redirect } from "next/navigation";
import { getTemplateSessionUser } from "../../../lib/auth";
import { getHistoryPage } from "../../../content/pages/history";
import { HistoryTimeline } from "../../../components/sections/ai-image-tool/history-timeline";

export default async function HistoryPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/app/history');
  const historyPage = await getHistoryPage();
  return (
    <div className="page-shell">
      <HistoryTimeline title={historyPage.title} lead={historyPage.lead} />
    </div>
  );
}
