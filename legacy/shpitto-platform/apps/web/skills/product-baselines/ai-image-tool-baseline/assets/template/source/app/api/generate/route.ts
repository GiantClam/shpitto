import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getTemplateSessionUser } from "../../../lib/auth";
import { generateImage } from "../../../lib/generation-provider";
import { getGeneration, saveGeneration } from "../../../lib/generation-store";
import { persistGeneratedAsset } from "../../../lib/asset-storage";
import { releaseReservation, reserveCredits, settleReservation } from "../../../lib/billing-store";

export async function POST(request: Request) {
  const user = await getTemplateSessionUser();
  if (!user && process.env.NODE_ENV === 'production') return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { prompt?: string; model?: string; aspectRatio?: string; referenceImageUrl?: string };
  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "Prompt is required." }, { status: 400 });
  }
  if (prompt.length > 4000) return NextResponse.json({ ok: false, error: 'Prompt is too long.' }, { status: 413 });
  const aspectRatio = ['1:1', '3:4', '4:3', '16:9', '9:16'].includes(String(body.aspectRatio || '')) ? String(body.aspectRatio) : '1:1';
  const model = String(body.model || process.env.REPLICATE_MODEL_VERSION || 'default').trim().slice(0, 120);
  const referenceImageUrl = String(body.referenceImageUrl || '').trim();
  if (referenceImageUrl && !/^https:\/\//i.test(referenceImageUrl)) return NextResponse.json({ ok: false, error: 'Reference image must be an HTTPS URL issued by the asset service.' }, { status: 400 });
  const blockedTerms = String(process.env.PROMPT_MODERATION_BLOCKLIST || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (blockedTerms.some((term) => prompt.toLowerCase().includes(term))) return NextResponse.json({ ok: false, error: 'Prompt was blocked by the configured moderation policy.' }, { status: 422 });
  const userId = user?.id || 'preview-user';
  const id = request.headers.get('x-idempotency-key')?.trim() || crypto.randomUUID();
  const existing = await getGeneration(userId, id);
  if (existing?.status === 'succeeded') return NextResponse.json({ ok: true, result: { id: existing.id, prompt: existing.prompt, imageUrl: existing.imageUrl, summary: 'Generation replayed from idempotency key.' }, historyItem: existing });
  const requiresCredits = String(process.env.REQUIRE_GENERATION_ENTITLEMENT || (process.env.NODE_ENV === 'production' ? '1' : '0')).trim() === '1';
  const reservation = requiresCredits ? await reserveCredits(userId, id, 1) : null;
  if (requiresCredits && !reservation) return NextResponse.json({ ok: false, error: 'No generation credits available.' }, { status: 402 });
  const providerMode = String(process.env.AI_PROVIDER_MODE || 'replicate').trim().toLowerCase();
  const previewRuntime = process.env.SHPITTO_TEMPLATE_PREVIEW === '1' || process.env.SHPITTO_TEMPLATE_PREVIEW === 'true';
  if (providerMode === 'mock' && process.env.NODE_ENV === 'production' && !previewRuntime) return NextResponse.json({ ok: false, error: 'Mock image generation is preview/test-only. Configure AI_PROVIDER_MODE=replicate for production.' }, { status: 503 });
  if (providerMode === 'replicate' && !String(process.env.REPLICATE_API_TOKEN || '').trim()) return NextResponse.json({ ok: false, error: 'The configured image provider is not available.' }, { status: 503 });
  try {
    const generated = await generateImage({ prompt, model, aspectRatio, referenceImageUrl: referenceImageUrl || undefined }, id);
    const persisted = await persistGeneratedAsset(generated.imageUrl, userId, id);
    const record = { id, userId, prompt, imageUrl: persisted.imageUrl, storageKey: persisted.storageKey, provider: generated.provider, model: generated.model, status: 'succeeded' as const, createdAt: new Date().toISOString(), metadata: { ...generated.metadata, aspectRatio, referenceImageUsed: Boolean(referenceImageUrl) } };
    await saveGeneration(record);
    if (reservation) await settleReservation(reservation);
    return NextResponse.json({ ok: true, result: { id, prompt, imageUrl: persisted.imageUrl, provider: generated.provider, summary: generated.provider === 'mock' ? 'Preview generation completed with the local mock provider.' : 'Generation completed with the configured provider.' }, historyItem: record });
  } catch (error) {
    if (reservation) await releaseReservation(reservation).catch(() => undefined);
    const message = String((error as Error)?.message || error || 'Generation failed.');
    return NextResponse.json({ ok: false, error: message, historyItem: { id, userId, prompt, status: 'failed', imageUrl: '', provider: 'unknown', model: '', createdAt: new Date().toISOString() } }, { status: 502 });
  }
}
