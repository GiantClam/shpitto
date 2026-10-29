import { NextResponse } from "next/server";
import { getTemplateSessionUser } from "../../../../lib/auth";
import { uploadReferenceAsset } from "../../../../lib/asset-storage";

export async function POST(request: Request) {
  const user = await getTemplateSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'An image file is required.' }, { status: 400 });
  try { return NextResponse.json({ ok: true, url: await uploadReferenceAsset(file, user.id) }); } catch (error) { return NextResponse.json({ ok: false, error: String((error as Error)?.message || error || 'Reference upload failed.') }, { status: 400 }); }
}
