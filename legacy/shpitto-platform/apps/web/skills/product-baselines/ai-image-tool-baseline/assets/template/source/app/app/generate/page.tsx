import { redirect } from "next/navigation";
import { getTemplateSessionUser } from "../../../lib/auth";
import { getGeneratePage } from "../../../content/pages/generate";
import { GenerateConsole } from "../../../components/sections/ai-image-tool/app-workspace";

export default async function GeneratePage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/app/generate');
  const generatePage = await getGeneratePage();
  return (
    <div className="page-shell">
      <GenerateConsole title={generatePage.title} lead={generatePage.lead} />
    </div>
  );
}
