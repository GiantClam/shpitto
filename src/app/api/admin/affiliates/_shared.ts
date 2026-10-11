import {DomainError} from '../../../../db/contracts.ts';

export function affiliatePageInput(request: Request): Readonly<{page: number; pageSize: number; status?: string}> {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some((key) => !['page', 'pageSize', 'status'].includes(key))) throw new DomainError('VALIDATION', 'Unsupported affiliate query field.');
  const page = Number(query.get('page') ?? 1);
  const pageSize = Number(query.get('pageSize') ?? 25);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new DomainError('VALIDATION', 'Affiliate reads require page 1–10000 and 1–100 records per page.');
  return {page, pageSize, status: query.get('status') || undefined};
}

export function affiliateUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new DomainError('VALIDATION', `${field} must be a UUID.`);
  return value;
}
