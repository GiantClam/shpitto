import { redirect } from "next/navigation";
import { getTemplateSessionUser } from "../../../lib/auth";
import { GiftCodePanel } from "../../../components/sections/ai-image-tool/gift-code-panel";

export default async function GiftCodePage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/app/giftcode');
  return (
    <div className="page-shell">
      <GiftCodePanel />
    </div>
  );
}
