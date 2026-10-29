export type CmsDataSource = 'payload' | 'product-api' | 'seed';
export type CmsTaskStatus = 'processing' | 'needs-attention' | 'ready';

export type CmsTask = { id: string; title: string; project: string; status: CmsTaskStatus; model: string; updatedAt: string; outputCount: number };
export type CmsProject = { id: string; name: string; summary: string; promptCount: number; assetCount: number; updatedAt: string };
export type CmsAsset = { id: string; title: string; project: string; status: 'approved' | 'review'; kind: string; altText: string; updatedAt: string };
export type CmsUser = { id: string; email: string; name: string; status: 'active' | 'invited' | 'suspended'; plan: string; credits: number; updatedAt: string };
export type CmsSettings = { siteName: string; defaultModel: string; enabledProviders: string[]; billingMode: string; seoStatus: string; payloadAdminUrl: string };

const seedTasks: CmsTask[] = [
  { id: 'task-001', title: 'Poster campaign batch', project: 'Campaign launch', status: 'processing', model: 'FLUX.1', updatedAt: '2 min ago', outputCount: 4 },
  { id: 'task-002', title: 'Editorial portrait rerun', project: 'Reusable looks', status: 'needs-attention', model: 'FLUX Schnell', updatedAt: '18 min ago', outputCount: 0 },
  { id: 'task-003', title: 'Homepage hero export', project: 'Campaign launch', status: 'ready', model: 'FLUX.1', updatedAt: '42 min ago', outputCount: 3 },
];

const seedProjects: CmsProject[] = [
  { id: 'project-001', name: 'Campaign launch', summary: 'Hero renders, social cut-downs, and publish metadata for the next release.', promptCount: 12, assetCount: 18, updatedAt: 'Today' },
  { id: 'project-002', name: 'Reusable looks', summary: 'Portrait, product, and editorial prompt recipes for repeat generation.', promptCount: 9, assetCount: 14, updatedAt: 'Yesterday' },
  { id: 'project-003', name: 'Client review', summary: 'Approved variants grouped for review, export, and handoff.', promptCount: 6, assetCount: 10, updatedAt: '3 days ago' },
];

const seedAssets: CmsAsset[] = [
  { id: 'asset-001', title: 'Homepage hero', project: 'Campaign launch', status: 'approved', kind: 'Hero render', altText: 'Approved FLUX.1 campaign hero render', updatedAt: '42 min ago' },
  { id: 'asset-002', title: 'Ad variant set', project: 'Campaign launch', status: 'review', kind: 'Social package', altText: 'Square social campaign variants awaiting review', updatedAt: '1 hour ago' },
  { id: 'asset-003', title: 'Portrait study', project: 'Reusable looks', status: 'approved', kind: 'Reference image', altText: 'Editorial portrait study generated with FLUX.1', updatedAt: 'Yesterday' },
];

const seedUsers: CmsUser[] = [
  { id: 'user-001', email: 'demo@fluxkreafree.com', name: 'Demo Creator', status: 'active', plan: 'Pro', credits: 240, updatedAt: 'Today' },
  { id: 'user-002', email: 'creator@example.com', name: 'Creator Example', status: 'active', plan: 'Free', credits: 32, updatedAt: 'Yesterday' },
  { id: 'user-003', email: 'review@example.com', name: 'Review Account', status: 'invited', plan: 'Free', credits: 0, updatedAt: '3 days ago' },
];

const seedSettings: CmsSettings = {
  siteName: 'FluxKrea Free',
  defaultModel: 'FLUX.1',
  enabledProviders: ['Replicate', 'RunningHub', 'Hugging Face'],
  billingMode: 'Hybrid credits + subscription',
  seoStatus: 'Ready for review',
  payloadAdminUrl: String(process.env.PAYLOAD_ADMIN_URL || ''),
};

const payloadApiUrl = String(process.env.PAYLOAD_API_URL || '').replace(/\/$/, '');
const productApiUrl = String(process.env.PRODUCT_API_URL || '').replace(/\/$/, '');
const payloadApiKey = String(process.env.PAYLOAD_API_KEY || '');

async function readJson<T>(url: string, apiKey = ''): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : undefined,
      next: { revalidate: 30 },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function readPayloadCollection<T>(slug: string): Promise<T[] | null> {
  if (!payloadApiUrl) return null;
  const response = await readJson<{ docs?: T[] }>(payloadApiUrl + '/api/' + slug + '?where[_status][equals]=published&limit=100', payloadApiKey);
  return Array.isArray(response?.docs) ? response.docs : null;
}

async function readProductCollection<T>(slug: string): Promise<T[] | null> {
  if (!productApiUrl) return null;
  const response = await readJson<{ data?: T[] } | T[]>(productApiUrl + '/' + slug);
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.data) ? response.data : null;
}

export async function getCmsTasks() {
  const remote = await readProductCollection<CmsTask>('tasks');
  return { items: remote || seedTasks, source: remote ? 'product-api' as const : 'seed' as const };
}

export async function getCmsProjects() {
  const remote = await readPayloadCollection<CmsProject>('projects');
  return { items: remote || seedProjects, source: remote ? 'payload' as const : 'seed' as const };
}

export async function getCmsAssets() {
  const remote = await readPayloadCollection<CmsAsset>('media');
  return { items: remote || seedAssets, source: remote ? 'payload' as const : 'seed' as const };
}

export async function getCmsUsers() {
  const remote = await readProductCollection<CmsUser>('users');
  return { items: remote || seedUsers, source: remote ? 'product-api' as const : 'seed' as const };
}

export async function getCmsSettings() {
  const [siteSettings, generationSettings, billingSettings] = await Promise.all([
    payloadApiUrl ? readJson<Partial<CmsSettings>>(payloadApiUrl + '/api/globals/site-settings', payloadApiKey) : Promise.resolve(null),
    payloadApiUrl ? readJson<Partial<CmsSettings>>(payloadApiUrl + '/api/globals/generation-settings', payloadApiKey) : Promise.resolve(null),
    payloadApiUrl ? readJson<Partial<CmsSettings>>(payloadApiUrl + '/api/globals/billing-settings', payloadApiKey) : Promise.resolve(null),
  ]);
  const settings = { ...seedSettings, ...siteSettings, ...generationSettings, ...billingSettings, payloadAdminUrl: seedSettings.payloadAdminUrl };
  return { settings, source: siteSettings || generationSettings || billingSettings ? 'payload' as const : 'seed' as const };
}

export async function getCmsOverview() {
  const [tasks, projects, assets, users, settings] = await Promise.all([getCmsTasks(), getCmsProjects(), getCmsAssets(), getCmsUsers(), getCmsSettings()]);
  const source = [tasks.source, projects.source, assets.source, settings.source].includes('payload') ? 'payload' as const : [tasks.source, projects.source, assets.source].includes('product-api') ? 'product-api' as const : 'seed' as const;
  return { tasks, projects, assets, users, settings, source };
}
