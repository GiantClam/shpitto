const requiredApprovals = Object.freeze(['merchantApproval', 'payoutOnboarding', 'sourcePrice', 'licenseLimits', 'refundPolicy', 'supportScope', 'sourceAffiliateTerms', 'separateServices', 'publicationAuthorization']);
const text = (value) => typeof value === 'string' && value.trim().length > 0;

function validHostedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^[a-z0-9-]+\.lemonsqueezy\.com$/.test(url.hostname)
      && /^\/checkout\/buy\/[a-zA-Z0-9-]+$/.test(url.pathname)
      && !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch { return false; }
}

export function commercialBlockers(config) {
  return [
    ...(config?.mode === 'hosted' ? [] : ['hostedMode']),
    ...(config?.provider === 'lemon-squeezy' ? [] : ['sourcePaymentProvider']),
    ...(config?.merchantAffiliateProgram === 'lemon-squeezy' ? [] : ['merchantAffiliateProgram']),
    ...(text(config?.merchantId) && config.merchantId !== 'local-vendor-fixture' ? [] : ['merchantIdentity']),
    ...(validHostedUrl(config?.hostedCheckoutUrl) ? [] : ['hostedCheckoutUrl']),
    ...requiredApprovals.filter((key) => config?.approvals?.[key]?.status !== 'approved' || !text(config.approvals[key].evidence)),
  ];
}

export function hostedCheckoutUrl(config) {
  const blockers = commercialBlockers(config);
  if (blockers.length) throw new Error(`Public checkout blocked: ${blockers.join(', ')}`);
  return config.hostedCheckoutUrl;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('A canonical UTC timestamp is required.');
  return Date.parse(value);
}

function twelveMonthsAfter(value) {
  const start = new Date(value);
  const end = new Date(value);
  end.setUTCFullYear(start.getUTCFullYear() + 1);
  if (end.getUTCMonth() !== start.getUTCMonth()) end.setUTCDate(0);
  return end.toISOString();
}

function entitlementPeriods(orders) {
  return [...orders].sort((a, b) => timestamp(a.purchasedAt) - timestamp(b.purchasedAt)).reduce((periods, order) => {
    const start = Math.max(timestamp(order.purchasedAt), periods.at(-1)?.end ?? 0);
    return [...periods, {start, end: timestamp(twelveMonthsAfter(start))}];
  }, []);
}

function validateSourceOrder(order, release, config) {
  if (!['mock', 'hosted'].includes(config?.mode) || order?.mode !== config.mode
    || config.provider !== 'lemon-squeezy' || order.provider !== 'lemon-squeezy'
    || !text(config.merchantId) || order.merchantId !== config.merchantId || order.status !== 'paid') {
    throw new Error('Source orders require a verified paid order in the isolated merchant and mode.');
  }
  if (config.mode === 'hosted') hostedCheckoutUrl(config);
  for (const key of ['id', 'buyerId', 'githubIdentity']) if (!text(order[key])) throw new Error(`Missing order field: ${key}`);
  timestamp(order.purchasedAt);
  if (!text(release?.version) || !/^[a-f0-9]{64}$/.test(release?.artifactSha256)) throw new Error('Release identity and SHA-256 are required.');
}

export function recordSourceOrder(entitlements, order, release, config) {
  validateSourceOrder(order, release, config);
  if (entitlements.some((entitlement) => entitlement.kind !== 'source-license' || entitlement.orders.some((previous) => previous.mode !== config.mode || previous.merchantId !== config.merchantId))) {
    throw new Error('Entitlement records must remain isolated by merchant and mode.');
  }
  const acquiredRelease = {version: release.version, artifactSha256: release.artifactSha256};
  const entry = {id: order.id, mode: order.mode, merchantId: order.merchantId, purchasedAt: order.purchasedAt, release: acquiredRelease};
  const priorOwner = entitlements.find((entitlement) => entitlement.orders.some((previous) => previous.id === order.id));
  if (priorOwner) {
    const prior = priorOwner.orders.find((previous) => previous.id === order.id);
    if (priorOwner.buyerId !== order.buyerId || priorOwner.githubIdentity !== order.githubIdentity || JSON.stringify(prior) !== JSON.stringify(entry)) {
      throw new Error('Source order identity conflict.');
    }
    return structuredClone(entitlements);
  }
  const existing = entitlements.find((entitlement) => entitlement.buyerId === order.buyerId);
  if (existing && existing.githubIdentity !== order.githubIdentity) throw new Error('Buyer identity conflict requires manual review.');
  const matchingRelease = existing?.releases.find((acquired) => acquired.version === release.version);
  if (matchingRelease && matchingRelease.artifactSha256 !== release.artifactSha256) throw new Error('Acquired release digest conflict.');
  const orders = [...(existing?.orders ?? []), entry];
  const updated = {
    kind: 'source-license', buyerId: order.buyerId, githubIdentity: order.githubIdentity,
    orders,
    releases: matchingRelease ? [...existing.releases] : [...(existing?.releases ?? []), acquiredRelease],
    updateSupportEndsAt: new Date(entitlementPeriods(orders).at(-1).end).toISOString(),
  };
  return structuredClone(existing ? entitlements.map((entitlement) => entitlement === existing ? updated : entitlement) : [...entitlements, updated]);
}

export function canReceiveRelease(entitlement, at) {
  const time = timestamp(at);
  return entitlementPeriods(entitlement.orders).some(({start, end}) => start <= time && time < end);
}

export function canAccessRelease(entitlement, release) {
  return entitlement.releases.some((acquired) => acquired.version === release.version && acquired.artifactSha256 === release.artifactSha256);
}
