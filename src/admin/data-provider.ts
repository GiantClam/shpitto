import type {DataProvider, GetListParams, GetOneParams, RaRecord} from 'react-admin';

import {adminRequest} from './http.ts';

const resources: Readonly<Record<string, string>> = {
  users: '/api/admin/users',
  workspaces: '/api/admin/workspaces',
  generations: '/api/admin/generations',
  billing: '/api/admin/billing',
  audit: '/api/admin/audit',
  'affiliate-reviews': '/api/admin/affiliates/reviews',
  'affiliate-holds': '/api/admin/affiliates/holds',
};

function endpoint(resource: string): string {
  const value = Object.hasOwn(resources, resource) ? resources[resource] : undefined;
  if (!value) throw new Error('Unsupported admin resource.');
  return value;
}

function listQuery(resource: string, params: GetListParams): URLSearchParams {
  const pagination = params.pagination ?? {page: 1, perPage: 25};
  if (!Number.isInteger(pagination.page) || pagination.page < 1 || !Number.isInteger(pagination.perPage) || pagination.perPage < 1 || pagination.perPage > 100) throw new Error('Admin pagination must use 1–100 records per page.');
  const query = new URLSearchParams({page: String(pagination.page), pageSize: String(pagination.perPage)});
  const filters = params.filter ?? {};
  const allowedFilters = resource === 'users' || resource === 'workspaces' ? ['q', 'status'] : resource === 'audit' ? [] : ['status'];
  for (const [field, value] of Object.entries(filters)) {
    if (!allowedFilters.includes(field) || (value !== undefined && typeof value !== 'string')) throw new Error('Unsupported admin filter.');
    if (value) query.set(field === 'q' ? 'filter' : field, String(value));
  }
  const defaultSort = resource === 'generations' || resource === 'affiliate-reviews' ? 'updatedAt' : 'createdAt';
  const sort = params.sort ?? {field: defaultSort, order: 'DESC'};
  const allowedSorts = resource === 'users' ? ['createdAt', 'email'] : [defaultSort];
  if (!allowedSorts.includes(sort.field) || !['ASC', 'DESC'].includes(sort.order) || (resource !== 'users' && sort.order !== 'DESC')) throw new Error('Unsupported admin sort.');
  if (resource === 'users') {
    query.set('sort', sort.field);
    query.set('direction', sort.order.toLowerCase());
  }
  return query;
}

export const adminDataProvider: DataProvider = {
  async getList<RecordType extends RaRecord = RaRecord>(resource: string, params: GetListParams) {
    const path = endpoint(resource);
    const query = listQuery(resource, params);
    const page = await adminRequest<{items: RecordType[]; page: number; pageSize: number; hasMore: boolean}>(`${path}?${query}`);
    const total = page.hasMore ? undefined : (page.page - 1) * page.pageSize + page.items.length;
    return {data: page.items, total, pageInfo: {hasNextPage: page.hasMore, hasPreviousPage: page.page > 1}};
  },
  async getOne<RecordType extends RaRecord = RaRecord>(resource: string, params: GetOneParams) {
    if (resource !== 'workspaces') throw new Error('Detail reads for this resource are not supported.');
    const purpose = params.meta?.purpose;
    if (typeof purpose !== 'string' || !purpose.trim()) throw new Error('A tenant access purpose is required.');
    const query = new URLSearchParams({purpose: purpose.trim()});
    const data = await adminRequest<RecordType>(`${endpoint(resource)}/${encodeURIComponent(params.id)}?${query}`);
    return {data};
  },
  async getMany() { throw new Error('Bulk admin reads are not supported.'); },
  async getManyReference() { throw new Error('Reference admin reads are not supported.'); },
  async create() { throw new Error('Use a named admin command.'); },
  async update() { throw new Error('Use a named admin command.'); },
  async updateMany() { throw new Error('Use a named admin command.'); },
  async delete() { throw new Error('Use a named admin command.'); },
  async deleteMany() { throw new Error('Use a named admin command.'); },
};
