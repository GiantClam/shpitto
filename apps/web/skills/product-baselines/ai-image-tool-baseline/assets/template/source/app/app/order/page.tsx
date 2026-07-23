import { redirect } from "next/navigation";
import { getTemplateSessionUser } from "../../../lib/auth";
import { OrderPanel } from "../../../components/sections/ai-image-tool/order-panel";

export default async function OrderPage() {
  const user = await getTemplateSessionUser();
  if (!user) redirect('/sign-in?next=/app/order');
  return (
    <div className="page-shell">
      <OrderPanel />
    </div>
  );
}
