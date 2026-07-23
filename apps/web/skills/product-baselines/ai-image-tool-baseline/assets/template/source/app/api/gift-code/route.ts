import { NextResponse } from "next/server";
import { getTemplateSessionUser } from "../../../lib/auth";
import { redeemGiftCode } from "../../../lib/billing-store";

export async function POST(request: Request) {
  const user = await getTemplateSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code || '').trim();
  if (!code) return NextResponse.json({ ok: false, error: 'Gift code is required.' }, { status: 400 });
  const creditAmount = await redeemGiftCode(user.id, code);
  if (!creditAmount) return NextResponse.json({ ok: false, error: 'Gift code is invalid, expired, or already used.' }, { status: 400 });
  return NextResponse.json({ ok: true, creditAmount });
}
