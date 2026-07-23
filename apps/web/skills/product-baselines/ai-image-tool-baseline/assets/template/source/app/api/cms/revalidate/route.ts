import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const expected = String(process.env.CMS_REVALIDATE_SECRET || '').trim();
  const received = String(request.headers.get('x-cms-revalidate-secret') || '').trim();
  if (!expected || received !== expected) return NextResponse.json({ ok: false, error: 'Invalid CMS revalidation secret.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { paths?: string[] };
  const paths = Array.isArray(body.paths) ? body.paths.map((item) => String(item || '').trim()).filter((item) => item.startsWith('/')).slice(0, 50) : ['/'];
  for (const route of paths) revalidatePath(route);
  return NextResponse.json({ ok: true, paths });
}
