import {randomUUID} from 'node:crypto';

export type IsoTimestamp = string & {readonly __brand: 'IsoTimestamp'};

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});

export function toIsoTimestamp(value: Date): IsoTimestamp {
  if (Number.isNaN(value.getTime())) throw new Error('Invalid timestamp.');
  return value.toISOString() as IsoTimestamp;
}

export type EntityId = string & {readonly __brand: 'EntityId'};

export function createEntityId(): EntityId {
  return randomUUID() as EntityId;
}

export function parseEntityId(value: string): EntityId {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Entity ID must be a UUID.');
  }
  return value as EntityId;
}

export type DomainErrorCode =
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'INFRASTRUCTURE';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly publicMessage: string;

  constructor(code: DomainErrorCode, publicMessage: string, options?: {cause?: unknown}) {
    super(publicMessage, options);
    this.name = 'DomainError';
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

