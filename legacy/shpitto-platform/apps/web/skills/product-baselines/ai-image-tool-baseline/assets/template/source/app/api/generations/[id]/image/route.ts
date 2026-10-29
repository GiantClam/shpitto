import { NextResponse } from "next/server";
import { getTemplateSessionUser } from "../../../../../lib/auth";
import { getGeneration } from "../../../../../lib/generation-store";
import { signedAssetUrl } from "../../../../../lib/asset-storage";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getTemplateSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const record = await getGeneration(user.id, String(id || ''));
  if (!record) return NextResponse.json({ ok: false, error: 'Generation was not found.' }, { status: 404 });
  const signed = record.storageKey ? await signedAssetUrl(record.storageKey) : null;
  if (signed) return NextResponse.redirect(signed);
  if (/^https?:\/\//i.test(record.imageUrl)) return NextResponse.redirect(record.imageUrl);
  return NextResponse.json({ ok: false, error: 'Asset storage is not configured.' }, { status: 503 });
}
