import {semanticHash} from '../contracts/http.ts';
import {DomainError} from '../db/contracts.ts';

export type CatalogProfile = 'local' | 'test' | 'acceptance' | 'production';

export type ModelCatalogEntry = Readonly<{
  id: string;
  label: string;
  enabled: boolean;
  creditsPerUnit: bigint;
  maxQuantity: bigint;
}>;

export type ServerQuote = Readonly<{
  modelId: string;
  catalogVersion: number;
  quantity: string;
  unitCost: string;
  totalCost: string;
  issuedAt: string;
  quoteHash: string;
}>;

const CATALOG_VERSION = 1;
const DEFAULT_MODEL: ModelCatalogEntry = Object.freeze({
  id: 'mock-video',
  label: 'Mock video',
  enabled: true,
  creditsPerUnit: 10n,
  maxQuantity: 1000n,
});

/** The local catalog is deliberately small until the generation adapter gate. */
export function getModelCatalog(profile: CatalogProfile = 'local'): ReadonlyMap<string, ModelCatalogEntry> {
  if (profile === 'production') return new Map();
  return new Map([[DEFAULT_MODEL.id, DEFAULT_MODEL]]);
}

export function getCatalogVersion(): number {
  return CATALOG_VERSION;
}

function quotePayload(input: Pick<ServerQuote, 'modelId' | 'catalogVersion' | 'quantity' | 'unitCost' | 'totalCost' | 'issuedAt'>): Readonly<Record<string, string | number>> {
  return {
    modelId: input.modelId,
    catalogVersion: input.catalogVersion,
    quantity: input.quantity,
    unitCost: input.unitCost,
    totalCost: input.totalCost,
    issuedAt: input.issuedAt,
  };
}

export function createServerQuote(
  modelId: string,
  quantity: string,
  options: Readonly<{profile?: CatalogProfile; now?: Date}> = {},
): ServerQuote {
  if (!/^\d+$/.test(quantity) || BigInt(quantity) <= 0n) {
    throw new DomainError('VALIDATION', 'Quote quantity must be a positive decimal integer.');
  }
  const profile = options.profile ?? 'local';
  const model = getModelCatalog(profile).get(modelId);
  if (!model || !model.enabled) throw new DomainError('CONFLICT', 'The requested model is unavailable.');
  const requested = BigInt(quantity);
  if (requested > model.maxQuantity) throw new DomainError('VALIDATION', 'Quote quantity exceeds the model limit.');
  const issuedAt = (options.now ?? new Date()).toISOString();
  const quote = {
    modelId,
    catalogVersion: CATALOG_VERSION,
    quantity,
    unitCost: model.creditsPerUnit.toString(10),
    totalCost: (requested * model.creditsPerUnit).toString(10),
    issuedAt,
  } satisfies Omit<ServerQuote, 'quoteHash'>;
  return Object.freeze({...quote, quoteHash: semanticHash('credit.quote', quotePayload(quote))});
}

export function assertCurrentServerQuote(quote: ServerQuote, profile: CatalogProfile = 'local'): ModelCatalogEntry {
  const model = getModelCatalog(profile).get(quote.modelId);
  if (!model || !model.enabled || quote.catalogVersion !== CATALOG_VERSION) {
    throw new DomainError('CONFLICT', 'The quote is stale or the model is disabled. Refresh the quote.');
  }
  if (!/^\d+$/.test(quote.quantity) || !/^\d+$/.test(quote.unitCost) || !/^\d+$/.test(quote.totalCost)) {
    throw new DomainError('VALIDATION', 'Quote amounts must be decimal strings.');
  }
  const quantity = BigInt(quote.quantity);
  if (quantity <= 0n || quantity > model.maxQuantity) {
    throw new DomainError('VALIDATION', 'Quote quantity is outside the model limit.');
  }
  const expectedTotal = quantity * model.creditsPerUnit;
  const expectedPayload = quotePayload(quote);
  if (quote.unitCost !== model.creditsPerUnit.toString(10) || quote.totalCost !== expectedTotal.toString(10)) {
    throw new DomainError('CONFLICT', 'The quote amount is not authoritative. Refresh the quote.');
  }
  if (quote.quoteHash !== semanticHash('credit.quote', expectedPayload)) {
    throw new DomainError('CONFLICT', 'The quote signature is invalid. Refresh the quote.');
  }
  return model;
}

export const DEFAULT_MODEL_ID = DEFAULT_MODEL.id;
