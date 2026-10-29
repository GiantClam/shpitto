import { NextResponse } from "next/server";
import { setCurrentLocale } from "../../../lib/i18n";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const updated = await setCurrentLocale(String(body.locale || ''));
  return NextResponse.json({ ok: updated }, { status: updated ? 200 : 400 });
}
