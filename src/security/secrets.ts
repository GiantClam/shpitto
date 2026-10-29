import {createCipheriv, createDecipheriv, hkdfSync, randomBytes} from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'shpitto-security-settings', 'aes-256-gcm:v1', 32));
}

export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(value: string, secret: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split('.');
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) throw new Error('Encrypted secret format is invalid.');
  const decipher = createDecipheriv(ALGORITHM, key(secret), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
}
