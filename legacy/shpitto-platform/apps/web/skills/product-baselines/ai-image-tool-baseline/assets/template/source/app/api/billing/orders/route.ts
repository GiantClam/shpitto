import { NextResponse } from "next/server";
import { getTemplateSessionUser } from "../../../../lib/auth";
import { listChargeOrders } from "../../../../lib/billing-store";

export async function GET() {
  const user = await getTemplateSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  return NextResponse.json({ ok: true, items: await listChargeOrders(user.id) });
}
