import { NextResponse } from "next/server";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../../lib/auth";

const forbiddenKeys = /secret|token|password|private.?key|webhook/i;

export async function POST(request: Request) {
  const user = await getTemplateSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  if (!isTemplateAdmin(user)) return NextResponse.json({ ok: false, error: 'CMS admin role is required.' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { collection?: string; id?: string; data?: Record<string, unknown> };
  const collection = String(body.collection || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = String(body.id || '').trim();
  const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
  if (!collection || Object.keys(data).length === 0 || Object.keys(data).some((key) => forbiddenKeys.test(key))) return NextResponse.json({ ok: false, error: 'A safe CMS collection and editable fields are required.' }, { status: 400 });
  const payloadUrl = String(process.env.PAYLOAD_API_URL || '').replace(/\/$/, '');
  const payloadKey = String(process.env.PAYLOAD_API_KEY || '').trim();
  if (!payloadUrl) { if (process.env.NODE_ENV === 'production') return NextResponse.json({ ok: false, error: 'Payload draft storage is not configured.' }, { status: 503 }); return NextResponse.json({ ok: true, mode: 'preview', collection, id: id || null, data }); }
  const method = id ? 'PATCH' : 'POST';
  const target = id ? `${payloadUrl}/api/${collection}/${encodeURIComponent(id)}` : `${payloadUrl}/api/${collection}`;
  const response = await fetch(target, { method, headers: { Authorization: `Bearer ${payloadKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, _status: 'draft' }) });
  if (!response.ok) return NextResponse.json({ ok: false, error: `Payload draft write failed with ${response.status}.` }, { status: 502 });
  const saved = await response.json().catch(() => ({}));
  return NextResponse.json({ ok: true, mode: 'payload', collection, id: String(saved?.doc?.id || saved?.id || id || ''), data: saved?.doc || saved });
}
