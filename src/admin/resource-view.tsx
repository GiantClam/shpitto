'use client';

import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';

import {Badge, type BadgeVariant} from '../components/ui/badge';
import {Button} from '../components/ui/button';
import {Card, CardContent, CardHeader} from '../components/ui/card';
import {Input} from '../components/ui/input';
import {Label} from '../components/ui/label';
import {Select} from '../components/ui/select';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '../components/ui/table';
import type {AdminListParams, AdminRecord} from './data-provider';
import {adminDataProvider} from './data-provider';
import type {AdminResourceName} from './capabilities';

type FilterDefinition = Readonly<{name: string; label: string; options?: readonly string[]}>;
type ColumnDefinition = Readonly<{name: string; label?: string; variant?: 'date' | 'status' | 'code'}>;
type ResourceDefinition = Readonly<{
  name: AdminResourceName;
  title: string;
  description: string;
  endpointLabel: string;
  defaultSort: string;
  filters?: readonly FilterDefinition[];
  columns: readonly ColumnDefinition[];
}>;

const statuses = (values: readonly string[]) => values.map((value) => value.replaceAll('_', ' '));

export const resourceDefinitions: Readonly<Record<AdminResourceName, ResourceDefinition>> = {
  workspaces: {
    name: 'workspaces', title: 'Workspaces', description: 'Review redacted workspace status, ownership and current versions.', endpointLabel: '/api/admin/workspaces', defaultSort: 'createdAt',
    filters: [{name: 'q', label: 'Search name'}, {name: 'status', label: 'Status', options: ['active', 'suspended', 'hold']}],
    columns: [{name: 'id', variant: 'code'}, {name: 'name'}, {name: 'kind'}, {name: 'status', variant: 'status'}, {name: 'billingStatus', label: 'Billing'}, {name: 'version'}, {name: 'memberCount', label: 'Members'}, {name: 'createdAt', variant: 'date'}],
  },
  users: {
    name: 'users', title: 'Users', description: 'Inspect bounded account and global operator role evidence.', endpointLabel: '/api/admin/users', defaultSort: 'createdAt',
    filters: [{name: 'q', label: 'Search email'}, {name: 'status', label: 'Status', options: ['active', 'disabled']}],
    columns: [{name: 'id', variant: 'code'}, {name: 'name'}, {name: 'email'}, {name: 'status', variant: 'status'}, {name: 'version', label: 'Access version'}, {name: 'operatorRole', label: 'Global role', variant: 'status'}, {name: 'operatorRoleVersion', label: 'Role version'}, {name: 'createdAt', variant: 'date'}],
  },
  generations: {
    name: 'generations', title: 'Generation tasks', description: 'Track queued, provider and delivery outcomes with bounded recovery evidence.', endpointLabel: '/api/admin/generations', defaultSort: 'updatedAt',
    filters: [{name: 'status', label: 'Status', options: statuses(['queued', 'dispatching', 'submission_unknown', 'submitted', 'running', 'materializing', 'succeeded', 'failed', 'cancelled'])}],
    columns: [{name: 'id', variant: 'code'}, {name: 'workspaceId', variant: 'code'}, {name: 'status', variant: 'status'}, {name: 'failureCode'}, {name: 'quotedCredits', label: 'Quoted credits'}, {name: 'providerCostState', label: 'Cost evidence', variant: 'status'}, {name: 'version'}, {name: 'updatedAt', variant: 'date'}],
  },
  billing: {
    name: 'billing', title: 'Billing and credits', description: 'Review order state and immutable monetary evidence without generic writes.', endpointLabel: '/api/admin/billing', defaultSort: 'createdAt',
    filters: [{name: 'status', label: 'Status', options: ['pending', 'paid', 'refunded', 'held', 'failed']}],
    columns: [{name: 'id', variant: 'code'}, {name: 'workspaceId', variant: 'code'}, {name: 'kind'}, {name: 'status', variant: 'status'}, {name: 'currency'}, {name: 'paidMinor', label: 'Paid minor units'}, {name: 'refundedMinor', label: 'Refunded minor units'}, {name: 'paidAt', variant: 'date'}],
  },
  audit: {
    name: 'audit', title: 'Audit events', description: 'Review immutable command and tenant access evidence.', endpointLabel: '/api/admin/audit', defaultSort: 'createdAt',
    columns: [{name: 'id', variant: 'code'}, {name: 'actorUserId', variant: 'code'}, {name: 'workspaceId', variant: 'code'}, {name: 'commandName'}, {name: 'commandKey', variant: 'code'}, {name: 'semanticHash', variant: 'code'}, {name: 'createdAt', variant: 'date'}],
  },
  'affiliate-reviews': {
    name: 'affiliate-reviews', title: 'Affiliate commission reviews', description: 'Review redacted commission evidence before a named decision.', endpointLabel: '/api/admin/affiliates/reviews', defaultSort: 'updatedAt',
    filters: [{name: 'status', label: 'Status', options: ['eligible', 'held', 'approve_pending', 'deny_pending', 'approved', 'denied']}],
    columns: [{name: 'id', label: 'Review ID', variant: 'code'}, {name: 'workspaceId', variant: 'code'}, {name: 'paymentReference', variant: 'code'}, {name: 'status', variant: 'status'}, {name: 'reason'}, {name: 'reviewVersion'}, {name: 'policyVersion'}, {name: 'accountCheckpointVersion'}, {name: 'refreshedAt', variant: 'date'}],
  },
  'affiliate-holds': {
    name: 'affiliate-holds', title: 'Affiliate review holds', description: 'Review unresolved correction cases and their expected versions.', endpointLabel: '/api/admin/affiliates/holds', defaultSort: 'createdAt',
    filters: [{name: 'status', label: 'Status', options: ['open', 'resolved']}],
    columns: [{name: 'id', label: 'Case ID', variant: 'code'}, {name: 'workspaceId', variant: 'code'}, {name: 'paymentReference', variant: 'code'}, {name: 'status', variant: 'status'}, {name: 'reason'}, {name: 'expectedVersion'}, {name: 'createdAt', variant: 'date'}, {name: 'resolvedAt', variant: 'date'}],
  },
};

function labelFor(name: string): string {
  return name.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase());
}

function displayValue(value: unknown, variant?: ColumnDefinition['variant']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (variant === 'date' && typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function badgeVariant(value: unknown): BadgeVariant {
  const text = String(value ?? '').toLowerCase();
  if (['active', 'paid', 'succeeded', 'approved', 'resolved', 'operator', 'superadmin'].includes(text)) return 'success';
  if (['failed', 'disabled', 'denied', 'cancelled', 'held', 'submission_unknown'].includes(text)) return 'danger';
  if (['pending', 'queued', 'running', 'dispatching', 'materializing', 'eligible', 'approve_pending', 'deny_pending', 'support'].includes(text)) return 'warning';
  return 'neutral';
}

type PageState = Readonly<{page: number; pageSize: number; hasMore: boolean; items: readonly AdminRecord[]}>;

export function AdminResourceView({resource}: Readonly<{resource: AdminResourceName}>) {
  const definition = resourceDefinitions[resource];
  const [pageState, setPageState] = useState<PageState | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(definition.defaultSort);
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const query = useMemo<AdminListParams>(() => ({pagination: {page, perPage: 25}, sort: {field: sort, order: sortDirection}, filter: filters}), [filters, page, sort, sortDirection]);

  const load = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      const result = await adminDataProvider.getList(resource, query);
      setPageState({page, pageSize: 25, hasMore: result.pageInfo.hasNextPage, items: result.data});
    } catch (reason) {
      setPageState(null);
      setError(reason instanceof Error ? reason.message : 'The resource could not be loaded.');
    } finally {
      setPending(false);
    }
  }, [page, query, resource]);

  useEffect(() => { void load(); }, [load]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters(Object.fromEntries(Object.entries(draftFilters).filter(([, value]) => value.trim())));
  }

  function clearFilters() {
    setDraftFilters({});
    setFilters({});
    setPage(1);
  }

  return <Card className="admin-resource-card">
    <CardHeader className="admin-resource-header">
      <div><p className="admin-eyebrow">{definition.endpointLabel}</p><h1>{definition.title}</h1><p>{definition.description}</p></div>
      <div className="admin-resource-meta"><span>Page {pageState?.page ?? page}</span><span>{pageState?.hasMore ? 'More records available' : pageState ? `${pageState.items.length} records on this page` : 'Awaiting response'}</span></div>
    </CardHeader>
    {definition.filters?.length ? <form className="admin-filter-bar" onSubmit={submitFilters}>
      {definition.filters.map((filter) => <Label key={filter.name}>{filter.label}{filter.options ? <Select value={draftFilters[filter.name] ?? ''} onChange={(event) => setDraftFilters((current) => ({...current, [filter.name]: event.target.value}))}><option value="">All</option>{filter.options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</Select> : <Input type="search" value={draftFilters[filter.name] ?? ''} onChange={(event) => setDraftFilters((current) => ({...current, [filter.name]: event.target.value}))} placeholder={`Search ${filter.name === 'q' ? 'records' : filter.name}`} />}</Label>)}
      <div className="admin-filter-actions"><Button type="submit">Apply filters</Button><Button type="button" variant="secondary" onClick={clearFilters}>Clear</Button></div>
    </form> : null}
    <CardContent>
      {error ? <div className="admin-state admin-state-error" role="alert"><strong>Unable to load this resource.</strong><span>{error}</span><Button type="button" variant="secondary" onClick={() => void load()}>Retry</Button></div> : null}
      {pending && !pageState ? <div className="admin-state" role="status">Loading {definition.title.toLowerCase()}…</div> : null}
      {!pending && !error && pageState?.items.length === 0 ? <div className="admin-state"><strong>No records match this view.</strong><span>Try another filter or clear the current filters.</span></div> : null}
      {pageState?.items.length ? <div className="admin-table-scroll"><Table><TableHead><TableRow>{definition.columns.map((column) => <TableHeader key={column.name}>{column.label ?? labelFor(column.name)}</TableHeader>)}</TableRow></TableHead><TableBody>{pageState.items.map((row, index) => <TableRow key={`${String(row.id ?? index)}-${index}`}>{definition.columns.map((column) => <TableCell key={column.name}>{column.variant === 'status' ? <Badge variant={badgeVariant(row[column.name])}>{displayValue(row[column.name], column.variant)}</Badge> : column.variant === 'code' ? <code>{displayValue(row[column.name], column.variant)}</code> : displayValue(row[column.name], column.variant)}</TableCell>)}</TableRow>)}</TableBody></Table></div> : null}
      <div className="admin-pagination"><span>Showing a bounded server page. Totals are reported only when the server can prove them.</span><div><Button type="button" variant="secondary" disabled={pending || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button type="button" variant="secondary" disabled={pending || !pageState?.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
    </CardContent>
  </Card>;
}

