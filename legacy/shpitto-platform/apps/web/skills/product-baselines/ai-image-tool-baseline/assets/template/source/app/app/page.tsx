import { redirect } from "next/navigation";
import { getTemplateSessionUser } from "../../lib/auth";
import { DashboardHub } from "../../components/sections/ai-image-tool/dashboard-hub";

export default async function AppPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/app');
  return (
    <div className="page-shell">
      <DashboardHub />
    </div>
  );
}
