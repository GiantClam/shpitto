import {createHash, timingSafeEqual} from 'node:crypto';
import {DomainError} from '../../../db/contracts.ts';
import type {ReplicateTransport} from './index.ts';

const API_BASE_URL = 'https://api.replicate.com/v1';
const BINDING_TTL_MS = 300_000;
export type ReplicateAccountBinding = Readonly<{accountId: string; confirmedAt: string; expiresAt: string}>;
type BindingConfig = Readonly<{
  transport: ReplicateTransport; token?: string; webhookSecret?: string; webhookAccountId?: string;
  apiBaseUrl?: string; webhookBaseUrl?: string; now?: Date;
}>;
type Proof = Readonly<{secretDigest: string; confirmedAt: number; expiresAt: number}>;
const proofs = new WeakMap<ReplicateAccountBinding, Proof>();
const cache = new WeakMap<ReplicateTransport, Readonly<{digest: string; binding: ReplicateAccountBinding}>>();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Only the documented whsec_ base64 representation is accepted as configuration. */
export function replicateSigningKey(secret: string): Uint8Array {
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new DomainError('INFRASTRUCTURE', 'Replicate webhook verification is not configured with a valid signing key.');
  const encoded = secret.slice(6);
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) throw new DomainError('INFRASTRUCTURE', 'Replicate webhook verification signing key is invalid.');
  return bytes;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Confirm token, expected type:username and receiver signing key before trusting either create or callback. */
export async function confirmReplicateAccountBinding(config: BindingConfig): Promise<ReplicateAccountBinding> {
  const now = (config.now ?? new Date()).getTime();
  const {token, webhookSecret: secret, webhookAccountId: accountId} = config;
  if (!Number.isFinite(now) || !token?.trim() || token !== token.trim() || /[\r\n]/.test(token)
    || !secret || !accountId || !/^(user|organization):[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(accountId)) {
    throw new DomainError('INFRASTRUCTURE', 'Replicate account binding requires a token, signing key and canonical type:username.');
  }
  const key = replicateSigningKey(secret);
  if (config.apiBaseUrl && config.apiBaseUrl !== API_BASE_URL) throw new DomainError('FORBIDDEN', 'Replicate account binding requires the official API origin and path.');
  const configDigest = digest(JSON.stringify([API_BASE_URL, token, secret, accountId, config.webhookBaseUrl ?? '']));
  const cached = cache.get(config.transport);
  if (cached?.digest === configDigest) {
    const proof = proofs.get(cached.binding);
    if (proof && now >= proof.confirmedAt && now < proof.expiresAt) return cached.binding;
  }
  if (cached) proofs.delete(cached.binding);
  cache.delete(config.transport);
  const read = async (path: string) => {
    const response = await config.transport.request({method: 'GET', url: `${API_BASE_URL}/${path}`, headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, retry: false});
    if (response.status !== 200) throw new DomainError('FORBIDDEN', 'Replicate account binding preflight was not confirmed.');
    return record(response.body);
  };
  try {
    const account = await read('account');
    if (`${account.type}:${account.username}` !== accountId) throw new DomainError('FORBIDDEN', 'Replicate account binding does not match the expected account.');
    const remote = await read('webhooks/default/secret');
    const remoteKey = replicateSigningKey(typeof remote.key === 'string' ? remote.key : '');
    if (key.length !== remoteKey.length || !timingSafeEqual(key, remoteKey)) throw new DomainError('FORBIDDEN', 'Replicate account binding signing key does not match the submission token.');
    const completedAt = (config.now ?? new Date()).getTime();
    if (completedAt < now || completedAt >= now + BINDING_TTL_MS) throw new DomainError('FORBIDDEN', 'Replicate account binding preflight expired.');
    const binding = Object.freeze({accountId, confirmedAt: new Date(now).toISOString(), expiresAt: new Date(now + BINDING_TTL_MS).toISOString()});
    proofs.set(binding, {secretDigest: digest(secret), confirmedAt: now, expiresAt: now + BINDING_TTL_MS});
    cache.set(config.transport, {digest: configDigest, binding});
    return binding;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('FORBIDDEN', 'Replicate account binding preflight is unavailable.');
  }
}

/** A caller-supplied account label or forged confirmation object is never proof. */
export function assertReplicateAccountBinding(binding: ReplicateAccountBinding | undefined, secret: string, now = new Date()): asserts binding is ReplicateAccountBinding {
  const proof = binding && proofs.get(binding);
  const time = now.getTime();
  if (!proof || !Number.isFinite(time) || time < proof.confirmedAt || time >= proof.expiresAt || proof.secretDigest !== digest(secret)) {
    throw new DomainError('FORBIDDEN', 'Replicate account binding is unconfirmed or expired.');
  }
}
