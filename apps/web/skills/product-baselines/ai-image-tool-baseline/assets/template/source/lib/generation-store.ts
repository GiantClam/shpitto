export type GenerationRecord = { id: string; userId: string; prompt: string; imageUrl: string; provider: string; model: string; status: 'succeeded' | 'failed'; createdAt: string; storageKey?: string; metadata?: Record<string, unknown> };

const processState = globalThis as typeof globalThis & { __shpittoGenerationMemory?: Map<string, GenerationRecord[]> };
const memory = processState.__shpittoGenerationMemory ??= new Map<string, GenerationRecord[]>();

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && key ? { url, key } : null;
}

export async function saveGeneration(record: GenerationRecord): Promise<void> {
  const current = memory.get(record.userId) || [];
  memory.set(record.userId, [record, ...current].slice(0, 100));
  const config = supabaseConfig();
  if (!config) return;
  const response = await fetch(`${config.url}/rest/v1/generation_jobs`, {
    method: 'POST',
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: record.id, user_id: record.userId, prompt: record.prompt, image_url: record.imageUrl, storage_key: record.storageKey || null, provider: record.provider, model: record.model, status: record.status, metadata: record.metadata || {}, created_at: record.createdAt }),
  });
  if (!response.ok) throw new Error(`Generation persistence failed with ${response.status}.`);
}

export async function getGeneration(userId: string, id: string): Promise<GenerationRecord | null> {
  const local = (memory.get(userId) || []).find((item) => item.id === id);
  if (local) return local;
  const config = supabaseConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/rest/v1/generation_jobs?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
  if (!response.ok) throw new Error(`Generation lookup failed with ${response.status}.`);
  const row = ((await response.json()) as Array<Record<string, unknown>>)[0];
  return row ? { id: String(row.id || ''), userId: String(row.user_id || userId), prompt: String(row.prompt || ''), imageUrl: String(row.image_url || ''), storageKey: String(row.storage_key || '') || undefined, provider: String(row.provider || ''), model: String(row.model || ''), status: String(row.status || 'failed') === 'succeeded' ? 'succeeded' : 'failed', createdAt: String(row.created_at || ''), metadata: (row.metadata || {}) as Record<string, unknown> } : null;
}

export async function listGenerations(userId: string): Promise<GenerationRecord[]> {
  const config = supabaseConfig();
  if (!config) return memory.get(userId) || [];
  const response = await fetch(`${config.url}/rest/v1/generation_jobs?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
  if (!response.ok) throw new Error(`Generation history failed with ${response.status}.`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({ id: String(row.id || ''), userId: String(row.user_id || userId), prompt: String(row.prompt || ''), imageUrl: String(row.image_url || ''), storageKey: String(row.storage_key || '') || undefined, provider: String(row.provider || ''), model: String(row.model || ''), status: String(row.status || 'failed') === 'succeeded' ? 'succeeded' : 'failed', createdAt: String(row.created_at || ''), metadata: (row.metadata || {}) as Record<string, unknown> }));
}
