import {parseProviderWorkerConfig, type ProviderWorkerConfig} from './provider-worker.ts';

const SAMPLE_VALUES = new Set([
  '',
  'replace-me',
  'change-me',
  'your-secret-here',
  'postgres://user:password@localhost:5432/database',
]);

function isSampleValue(value: string): boolean {
  return SAMPLE_VALUES.has(value) || /^(replace-me|change-me|your-)/i.test(value);
}

type ServerEnv = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  runtimeProfile: 'local' | 'acceptance' | 'production';
  appUrl: string;
  databaseUrl: string;
  betterAuthSecret: string;
  storageDriver: string;
  generationDriver: string;
  mailDriver: string;
  assetRoot: string;
  storageS3Endpoint: string;
  storageS3Region: string;
  storageS3Bucket: string;
  storageS3AccessKeyId: string;
  storageS3SecretAccessKey: string;
  storageS3ForcePathStyle: boolean;
  workerHealthUrl: string;
  mailSmtpUrl: string;
  mailHttpUrl: string;
  billingWebhookSecret: string;
  replicateWebhookSecret: string;
  replicateWebhookAccountId: string;
  falWebhookPublicKeyPem: string;
  falWebhookAccountId: string;
  falWebhookBaseUrl: string;
  affiliateReferralSecret: string;
  affiliateWebhookSecret: string;
  affiliateProgramId: string;
}>;

function read(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export function getServerEnv(): ServerEnv {
  const nodeEnv = (read('NODE_ENV') || 'development') as ServerEnv['nodeEnv'];
  const runtimeProfile = (read('SHPTITTO_RUNTIME_PROFILE') || (nodeEnv === 'production' ? 'production' : 'local')) as ServerEnv['runtimeProfile'];
  if (!['local', 'acceptance', 'production'].includes(runtimeProfile)) throw new Error('SHPTITTO_RUNTIME_PROFILE must be local, acceptance, or production.');
  if (runtimeProfile === 'acceptance' && nodeEnv !== 'production') throw new Error('Acceptance runtime profile requires NODE_ENV=production.');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const values = {
    appUrl: read('APP_URL'),
    databaseUrl: read('DATABASE_URL'),
    betterAuthSecret: read('BETTER_AUTH_SECRET'),
    storageDriver: (read('STORAGE_DRIVER') || 'local') === 's3-compatible' ? 's3' : (read('STORAGE_DRIVER') || 'local'),
    generationDriver: read('GENERATION_DRIVER') || 'mock',
    mailDriver: read('MAIL_DRIVER') || 'local',
    assetRoot: read('ASSET_ROOT') || './.data/assets',
    storageS3Endpoint: read('STORAGE_S3_ENDPOINT'),
    storageS3Region: read('STORAGE_S3_REGION') || 'auto',
    storageS3Bucket: read('STORAGE_S3_BUCKET'),
    storageS3AccessKeyId: read('STORAGE_S3_ACCESS_KEY_ID'),
    storageS3SecretAccessKey: read('STORAGE_S3_SECRET_ACCESS_KEY'),
    storageS3ForcePathStyle: read('STORAGE_S3_FORCE_PATH_STYLE').toLowerCase() === 'true',
    workerHealthUrl: read('WORKER_HEALTH_URL') || 'http://localhost:8080/healthz',
    mailSmtpUrl: read('MAIL_SMTP_URL') || 'smtp://localhost:1025',
    billingWebhookSecret: read('BILLING_WEBHOOK_SECRET') || (nodeEnv === 'production' ? '' : 'local-development-billing-webhook-secret'),
    replicateWebhookSecret: read('REPLICATE_WEBHOOK_SECRET'),
    replicateWebhookAccountId: read('REPLICATE_WEBHOOK_ACCOUNT_ID'),
    falWebhookPublicKeyPem: read('FAL_WEBHOOK_PUBLIC_KEY_PEM'),
    falWebhookAccountId: read('FAL_WEBHOOK_ACCOUNT_ID'),
    falWebhookBaseUrl: read('FAL_WEBHOOK_BASE_URL'),
    affiliateReferralSecret: read('AFFILIATE_REFERRAL_SECRET'),
    affiliateWebhookSecret: read('AFFILIATE_WEBHOOK_SECRET'),
    affiliateProgramId: read('AFFILIATE_PROGRAM_ID'),
  };

  if (nodeEnv === 'production') {
    if (values.storageDriver === 'local') throw new Error('Production STORAGE_DRIVER (storageDriver) must use the private S3-compatible driver.');
    if (values.storageDriver !== 's3') throw new Error('Production STORAGE_DRIVER must be local or s3.');
    const storageFields = {
      storageS3Endpoint: values.storageS3Endpoint,
      storageS3Region: values.storageS3Region,
      storageS3Bucket: values.storageS3Bucket,
      storageS3AccessKeyId: values.storageS3AccessKeyId,
      storageS3SecretAccessKey: values.storageS3SecretAccessKey,
    };
    if (read('NEXT_PHASE') !== 'phase-production-build') {
      const storageMissing = Object.entries(storageFields)
        .filter(([, value]) => isSampleValue(value)).map(([name]) => name);
      if (storageMissing.length > 0) throw new Error(`Production S3-compatible storage is incomplete: ${storageMissing.join(', ')}`);
    }
    // Optional integrations validate their own configuration when activated.
    // Their absent credentials must not prevent the core application starting.
    const optional = new Set([
      'billingWebhookSecret', 'affiliateReferralSecret', 'affiliateWebhookSecret', 'affiliateProgramId',
      'replicateWebhookSecret', 'replicateWebhookAccountId', 'falWebhookPublicKeyPem', 'falWebhookAccountId', 'falWebhookBaseUrl',
    ]);
    const missing = Object.entries(values)
      .filter(([name, value]) =>
        !optional.has(name) && !Object.hasOwn(storageFields, name) && typeof value === 'string' && (isSampleValue(value) ||
        (name === 'storageDriver' && value === 'local') ||
        (name === 'generationDriver' && value === 'mock') ||
        (name === 'mailDriver' && value === 'local')),
      )
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`Production configuration contains empty or sample values: ${missing.join(', ')}`);
    }
  }

  return Object.freeze({nodeEnv, runtimeProfile, ...values, mailHttpUrl: read('MAIL_HTTP_URL') || 'http://localhost:8025'});
}

/** Resolve the demo-funding guard without forcing unrelated production secrets during tests. */
export function getRuntimeProfile(): 'local' | 'acceptance' | 'production' {
  const nodeEnv = read('NODE_ENV');
  const profile = read('SHPTITTO_RUNTIME_PROFILE');
  if (profile === 'acceptance' && nodeEnv === 'production') return 'acceptance';
  return nodeEnv === 'production' ? 'production' : 'local';
}

/** Worker controls are server-only and paused unless explicitly bound to an isolated project/workspace. */
export function getProviderWorkerConfig(): ProviderWorkerConfig {
  const env = getServerEnv();
  return parseProviderWorkerConfig({runtimeProfile: env.runtimeProfile, generationDriver: env.generationDriver, storageDriver: env.storageDriver,
    railwayProjectId: read('RAILWAY_PROJECT_ID'), expectedProjectId: read('SHPITTO_PROVIDER_WORKER_PROJECT_ID'), workspaceId: read('SHPITTO_PROVIDER_WORKER_WORKSPACE_ID'),
    state: read('SHPITTO_PROVIDER_WORKER_STATE'), allowCreate: read('SHPITTO_PROVIDER_WORKER_ALLOW_CREATE'), modelKeys: read('SHPITTO_PROVIDER_WORKER_MODEL_KEYS'), pollMs: read('SHPITTO_PROVIDER_WORKER_POLL_MS')});
}

export function getProviderCredentials() {
  return Object.freeze({replicateToken: read('REPLICATE_API_TOKEN'), falToken: read('FAL_KEY'),
    replicateWebhookBaseUrl: read('REPLICATE_WEBHOOK_BASE_URL'), falWebhookBaseUrl: read('FAL_WEBHOOK_BASE_URL'), port: read('PORT') || '8080'});
}
