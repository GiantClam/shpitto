import crypto from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function storageConfig() {
  const bucket = String(process.env.S3_BUCKET || '').trim();
  const region = String(process.env.S3_REGION || 'auto').trim();
  const endpoint = String(process.env.S3_ENDPOINT || '').trim();
  const accessKeyId = String(process.env.S3_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.S3_SECRET_ACCESS_KEY || '').trim();
  return bucket && endpoint && accessKeyId && secretAccessKey ? { bucket, region, endpoint, accessKeyId, secretAccessKey } : null;
}

function client(config: NonNullable<ReturnType<typeof storageConfig>>) {
  return new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
}

export async function persistGeneratedAsset(sourceUrl: string, userId: string, generationId: string): Promise<{ imageUrl: string; storageKey?: string }> {
  const config = storageConfig();
  if (!config) return { imageUrl: sourceUrl };
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:') throw new Error('Generated asset URL must use HTTPS.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Generated asset download failed with ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (!contentType.startsWith('image/') || (declaredLength && declaredLength > 20 * 1024 * 1024)) throw new Error('Generated asset must be an image smaller than 20 MB.');
  const extension = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const storageKey = `generations/${encodeURIComponent(userId)}/${generationId}.${extension}`;
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 20 * 1024 * 1024) throw new Error('Generated asset must be an image smaller than 20 MB.');
  await client(config).send(new PutObjectCommand({ Bucket: config.bucket, Key: storageKey, Body: body, ContentType: contentType, CacheControl: 'private, max-age=31536000, immutable' }));
  return { imageUrl: `/api/generations/${encodeURIComponent(generationId)}/image`, storageKey };
}

export async function signedAssetUrl(storageKey: string): Promise<string | null> {
  const config = storageConfig();
  if (!config || !storageKey) return null;
  const ttl = Math.max(60, Math.min(86400, Number(process.env.ASSET_URL_TTL_SECONDS || 900)));
  return getSignedUrl(client(config), new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }), { expiresIn: ttl });
}

export async function uploadReferenceAsset(file: File, userId: string): Promise<string> {
  const config = storageConfig();
  if (!config) throw new Error('Reference image storage is not configured.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Reference image must be a JPEG, PNG, or WebP smaller than 20 MB.');
  const extension = file.type.includes('jpeg') ? 'jpg' : file.type.includes('webp') ? 'webp' : 'png';
  const storageKey = `references/${encodeURIComponent(userId)}/${crypto.randomUUID()}.${extension}`;
  const body = Buffer.from(await file.arrayBuffer());
  const signatures: Record<string, number[]> = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
  if (!signatures[file.type].every((byte, index) => body[index] === byte)) throw new Error('Reference image content does not match its declared type.');
  await client(config).send(new PutObjectCommand({ Bucket: config.bucket, Key: storageKey, Body: body, ContentType: file.type, CacheControl: 'private, max-age=3600' }));
  return (await signedAssetUrl(storageKey)) || storageKey;
}
