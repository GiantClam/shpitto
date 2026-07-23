import { redirect } from "next/navigation";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../lib/auth";
import { listGiftCodes } from "../../../lib/billing-store";
import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";
import { AdminGiftCodesPanel } from "../../../components/sections/ai-image-tool/admin-gift-codes-panel";

export default async function CmsGiftCodesPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/admin/gift-codes');
  if (!isTemplateAdmin(user)) redirect('/app?admin=required');
  const items = await listGiftCodes();
  const source = process.env.SUPABASE_URL ? 'product-api' as const : 'seed' as const;
  return (
    <div className="page-shell">
      <CmsShell active="gift-codes" title="Gift code management" lead="Create and review single-use credit codes from the hidden administrator CMS." source={source}>
        <AdminGiftCodesPanel initialItems={items} />
      </CmsShell>
    </div>
  );
}
