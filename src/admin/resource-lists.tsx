'use client';

import {Datagrid, DateField, List, SelectInput, TextField, useInput} from 'react-admin';

const statuses = (values: string[]) => values.map((value) => ({id: value, name: value.replaceAll('_', ' ')}));

// The installed SearchInput forwards MUI's removed InputProps to the DOM.
// Keep React-admin's form binding without that incompatible presentation layer.
function AdminSearchInput({source}: Readonly<{source: string; alwaysOn?: boolean}>) {
  const {field, id} = useInput({source, defaultValue: ''});
  return <div className="operations-form"><label htmlFor={id}>Search<input {...field} id={id} type="search" /></label></div>;
}

export function WorkspaceList() {
  return <List title="Workspaces" exporter={false} perPage={25} sort={{field: 'createdAt', order: 'DESC'}} filters={[<AdminSearchInput key="q" source="q" alwaysOn />, <SelectInput key="status" source="status" choices={statuses(['active', 'suspended', 'hold'])} alwaysOn />]}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" sortable={false} /><TextField source="name" sortable={false} /><TextField source="kind" sortable={false} /><TextField source="status" sortable={false} /><TextField source="billingStatus" sortable={false} /><TextField source="version" sortable={false} /><TextField source="memberCount" sortable={false} />
    </Datagrid>
  </List>;
}

export function UserList() {
  return <List title="Users" exporter={false} perPage={25} sort={{field: 'createdAt', order: 'DESC'}} filters={[<AdminSearchInput key="q" source="q" alwaysOn />, <SelectInput key="status" source="status" choices={statuses(['active', 'disabled'])} alwaysOn />]}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" sortable={false} /><TextField source="name" sortable={false} /><TextField source="email" /><TextField source="status" sortable={false} /><TextField source="version" label="Access version" sortable={false} /><TextField source="operatorRole" sortable={false} /><TextField source="operatorRoleVersion" label="Role version" sortable={false} /><DateField source="createdAt" />
    </Datagrid>
  </List>;
}

export function GenerationList() {
  return <List title="Generations" exporter={false} perPage={25} sort={{field: 'updatedAt', order: 'DESC'}} filters={[<SelectInput key="status" source="status" choices={statuses(['queued', 'dispatching', 'submission_unknown', 'submitted', 'running', 'materializing', 'succeeded', 'failed', 'cancelled'])} alwaysOn />]}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" sortable={false} /><TextField source="workspaceId" sortable={false} /><TextField source="status" sortable={false} /><TextField source="failureCode" sortable={false} /><TextField source="quotedCredits" sortable={false} /><TextField source="providerCostState" label="Cost evidence" sortable={false} /><TextField source="version" sortable={false} /><DateField source="updatedAt" showTime sortable={false} />
    </Datagrid>
  </List>;
}

export function BillingList() {
  return <List title="Billing orders" exporter={false} perPage={25} sort={{field: 'createdAt', order: 'DESC'}} filters={[<SelectInput key="status" source="status" choices={statuses(['pending', 'paid', 'refunded', 'held', 'failed'])} alwaysOn />]}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" sortable={false} /><TextField source="workspaceId" sortable={false} /><TextField source="kind" sortable={false} /><TextField source="status" sortable={false} /><TextField source="currency" sortable={false} /><TextField source="paidMinor" label="Paid (minor units)" sortable={false} /><TextField source="refundedMinor" label="Refunded (minor units)" sortable={false} /><DateField source="paidAt" sortable={false} />
    </Datagrid>
  </List>;
}

export function AuditList() {
  return <List title="Audit events" exporter={false} perPage={25} sort={{field: 'createdAt', order: 'DESC'}}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" sortable={false} /><TextField source="actorUserId" sortable={false} /><TextField source="workspaceId" sortable={false} /><TextField source="commandName" sortable={false} /><TextField source="commandKey" sortable={false} /><DateField source="createdAt" showTime sortable={false} />
    </Datagrid>
  </List>;
}

export function AffiliateReviewList() {
  return <List title="Affiliate commission reviews" exporter={false} perPage={25} sort={{field: 'updatedAt', order: 'DESC'}} filters={[<SelectInput key="status" source="status" choices={statuses(['eligible', 'held', 'approve_pending', 'deny_pending', 'denied', 'approved'])} alwaysOn />]}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" label="Review ID" sortable={false} /><TextField source="workspaceId" sortable={false} /><TextField source="paymentReference" sortable={false} /><TextField source="status" sortable={false} /><TextField source="reason" sortable={false} /><TextField source="reviewVersion" sortable={false} /><TextField source="policyVersion" sortable={false} /><TextField source="accountCheckpointVersion" sortable={false} /><DateField source="refreshedAt" showTime sortable={false} />
    </Datagrid>
  </List>;
}

export function AffiliateHoldList() {
  return <List title="Affiliate review holds" exporter={false} perPage={25} sort={{field: 'createdAt', order: 'DESC'}} filters={[<SelectInput key="status" source="status" choices={statuses(['open', 'resolved'])} alwaysOn />]}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" label="Case ID" sortable={false} /><TextField source="workspaceId" sortable={false} /><TextField source="paymentReference" sortable={false} /><TextField source="status" sortable={false} /><TextField source="reason" sortable={false} /><TextField source="expectedVersion" sortable={false} /><DateField source="createdAt" showTime sortable={false} /><DateField source="resolvedAt" showTime sortable={false} />
    </Datagrid>
  </List>;
}
