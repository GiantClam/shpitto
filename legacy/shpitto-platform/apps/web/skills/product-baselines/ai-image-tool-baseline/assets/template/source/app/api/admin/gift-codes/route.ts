import { NextResponse } from "next/server";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../../lib/auth";
import { createGiftCode, listGiftCodes } from "../../../../lib/billing-store";

async function requireAdmin() {
  const user = await getTemplateSessionUser();
  return user && isTemplateAdmin(user) ? user : null;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ ok: false, error: 'CMS admin role is required.' }, { status: 403 });
  return NextResponse.json({ ok: true, items: await listGiftCodes() });
}

export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ ok: false, error: 'CMS admin role is required.' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { creditAmount?: number; expiresAt?: string };
  const creditAmount = Number(body.creditAmount);
  if (!Number.isFinite(creditAmount) || creditAmount < 1 || creditAmount > 100000) return NextResponse.json({ ok: false, error: 'Credit amount must be between 1 and 100000.' }, { status: 400 });
  const expiresAt = String(body.expiresAt || '').trim();
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return NextResponse.json({ ok: false, error: 'Expiration must be a valid date.' }, { status: 400 });
  return NextResponse.json({ ok: true, item: await createGiftCode(creditAmount, expiresAt || undefined) });
}
