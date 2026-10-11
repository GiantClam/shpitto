export type GenerationProvider = 'mock' | 'replicate';
export type GenerationResult = { imageUrl: string; provider: GenerationProvider; model: string; metadata: Record<string, unknown> };

function buildMockImage(prompt: string): string {
  const safePrompt = String(prompt || '').slice(0, 72).replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#111827"/><circle cx="760" cy="220" r="150" fill="#7c3aed" opacity=".65"/><text x="80" y="160" fill="#fff" font-family="Arial" font-size="42">Local mock image</text><text x="80" y="240" fill="#d1d5db" font-family="Arial" font-size="26">${safePrompt}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function outputUrl(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
  return '';
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { detail?: string; error?: string };
  if (!response.ok) throw new Error(String(payload.detail || payload.error || `Provider request failed with ${response.status}.`));
  return payload;
}

export type GenerationInput = { prompt: string; model?: string; aspectRatio?: string; referenceImageUrl?: string };

async function generateWithReplicate(input: GenerationInput, requestId: string): Promise<GenerationResult> {
  const token = String(process.env.REPLICATE_API_TOKEN || '').trim();
  const version = String(process.env.REPLICATE_MODEL_VERSION || '').trim();
  if (!token || !version) throw new Error('Replicate is not configured. Set REPLICATE_API_TOKEN and REPLICATE_MODEL_VERSION.');
  const pollAttempts = Math.max(1, Math.min(180, Number.parseInt(process.env.REPLICATE_POLL_ATTEMPTS || '90', 10) || 90));
  const pollIntervalMs = Math.max(500, Math.min(10000, Number.parseInt(process.env.REPLICATE_POLL_INTERVAL_MS || '2000', 10) || 2000));
  const created = await readJson<{ id: string; status: string; output?: unknown }>(await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=60', 'X-Request-Id': requestId },
    body: JSON.stringify({ version, input: { prompt: input.prompt, aspect_ratio: input.aspectRatio || '1:1', image: input.referenceImageUrl || undefined } }),
  }));
  let current = created;
  for (let attempt = 0; attempt < pollAttempts && !['succeeded', 'failed', 'canceled'].includes(String(current.status)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    current = await readJson<{ id: string; status: string; output?: unknown; error?: string }>(await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(created.id)}`, { headers: { Authorization: `Bearer ${token}` } }));
  }
  const imageUrl = outputUrl(current.output);
  if (!['succeeded', 'failed', 'canceled'].includes(String(current.status))) throw new Error(`Replicate generation timed out after ${pollAttempts} status checks.`);
  if (current.status !== 'succeeded' || !imageUrl) throw new Error(String((current as { error?: string }).error || `Replicate generation ended with ${current.status}.`));
  return { imageUrl, provider: 'replicate', model: version, metadata: { predictionId: created.id } };
}

export async function generateImage(input: GenerationInput, requestId: string): Promise<GenerationResult> {
  const mode = String(process.env.AI_PROVIDER_MODE || 'replicate').trim().toLowerCase();
  const previewRuntime = process.env.SHPITTO_TEMPLATE_PREVIEW === '1' || process.env.SHPITTO_TEMPLATE_PREVIEW === 'true';
  if (mode === 'mock') {
    if (process.env.NODE_ENV === 'production' && !previewRuntime) throw new Error('Mock image generation is preview/test-only. Configure AI_PROVIDER_MODE=replicate for production.');
    return { imageUrl: buildMockImage(input.prompt), provider: 'mock', model: input.model || 'local-mock', metadata: { aspectRatio: input.aspectRatio || '1:1', referenceImageUrl: input.referenceImageUrl || null } };
  }
  if (mode !== 'replicate') throw new Error(`Unsupported AI_PROVIDER_MODE: ${mode}.`);
  return generateWithReplicate(input, requestId);
}
