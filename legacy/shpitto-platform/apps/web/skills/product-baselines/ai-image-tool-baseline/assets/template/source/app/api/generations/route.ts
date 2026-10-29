import { NextResponse } from "next/server";
import { getTemplateSessionUser } from "../../../lib/auth";
import { listGenerations } from "../../../lib/generation-store";

export async function GET() {
  const user = await getTemplateSessionUser();
  if (!user && process.env.NODE_ENV === 'production') return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  const items = await listGenerations(user?.id || 'preview-user');
  return NextResponse.json({ ok: true, items });
}
