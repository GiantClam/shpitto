import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getTemplateSessionUser, isTemplateAdmin } from "../../../../lib/auth";


export async function POST(request: Request) {
  const user = await getTemplateSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  if (!isTemplateAdmin(user)) return NextResponse.json({ ok: false, error: 'CMS admin role is required.' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { collection?: string; id?: string; paths?: string[] };
  const collection = String(body.collection || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = String(body.id || '').trim();
  if (!collection || !id) return NextResponse.json({ ok: false, error: 'collection and id are required.' }, { status: 400 });
  const payloadUrl = String(process.env.PAYLOAD_API_URL || '').replace(/\/$/, '');
  const payloadKey = String(process.env.PAYLOAD_API_KEY || '').trim();
  if (process.env.NODE_ENV === 'production' && (!payloadUrl || !payloadKey)) return NextResponse.json({ ok: false, error: 'Payload publication is not configured.' }, { status: 503 });
  if (payloadUrl) {
    const response = await fetch(`${payloadUrl}/api/${collection}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${payloadKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ _status: 'published' }) });
    if (!response.ok) return NextResponse.json({ ok: false, error: `Payload publication failed with ${response.status}.` }, { status: 502 });
  }
  const paths = Array.isArray(body.paths) ? body.paths.map((item) => String(item || '').trim()).filter((item) => item.startsWith('/')).slice(0, 50) : ['/'];
  for (const route of paths) revalidatePath(route);
  return NextResponse.json({ ok: true, collection, id, paths, publishedBy: user.email, mode: payloadUrl ? 'payload' : 'preview' });
}
