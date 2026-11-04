# 本地修复方案：Portal 取消只写 `cancel_at`，应用未镜像（APP_REFLECTION_FAIL）

- 仓库：`D:\github\shpitto`（Windows PowerShell）
- 证据：同目录 `STATUS.md`；事件 `evt_1UXyOjRcvKApiJYWsCPe2EWM`
- 约束：**由你在本机改代码**；不要用 CloudAgent；本文件只是方案，**尚未改业务代码**
- Staging 账号：Stripe sandbox `acct_1USYQxRcvKApiJYW`，`livemode=false`
- 订阅：`sub_1UXXXpRcvKApiJYW5NlKrZys`（当前 Stripe 侧 `cancel_at_period_end=false` 且 `cancel_at=1796265232`）

---

## 1) 根因（一段话）

Stripe Customer Portal（flexible billing）把「期末取消」写成订阅字段 **`cancel_at`（Unix 秒）**，并保持 **`cancel_at_period_end=false`**。应用在 `src/adapters/billing/stripe-test-events.ts` 的 `Subscription` 类型与 `normalizeSubscription` 里**只读取** `cancel_at_period_end`（约第 38、490 行），再经 `mirrorSubscription` 写入 `billing_subscriptions.cancel_at_period_end`；账单页 `page.tsx` 也只根据该布尔值显示「Cancellation at period end」。因此 Portal 取消后 Stripe 已显示 Cancels Dec 3，Staging 仍显示「active / No scheduled cancellation」。先前用 API 直接把 `cancel_at_period_end=true` 能镜像成功，也证明 webhook 通路正常，问题在映射字段。

---

## 2) 要改的文件与可贴片段（风格对齐现有单行/紧凑写法）

### 2.1 `src/adapters/billing/stripe-test-events.ts`

**类型（约第 38–41 行）** — 把 `Pick` 加上 `'cancel_at'`：

```ts
type Subscription = Pick<Stripe.Subscription, 'id' | 'livemode' | 'cancel_at_period_end' | 'cancel_at'> & Readonly<{
  customer: Reference; status: string; automatic_tax: Readonly<{enabled: boolean}>;
  default_tax_rates?: readonly unknown[] | null; discounts: readonly unknown[]; items: Page<SubscriptionItem>;
}>;
```

**`normalizeSubscription` 返回值（约第 487–490 行）** — 在 `return {…}` 前增加推导，并把字段传出：

```ts
    const cancelAt = subscription.cancel_at == null ? null : new Date(subscription.cancel_at * 1000);
    const cancelAtPeriodEnd = subscription.cancel_at_period_end || cancelAt != null;
    return {provider: 'stripe', workspaceId: binding.workspaceId, customerId: state.customerId, externalId: subscription.id,
      catalogSnapshot: binding.catalogSnapshot, status: subscription.status as SubscriptionObservation['status'],
      periodStart: new Date(item.current_period_start * 1000), periodEnd: new Date(item.current_period_end * 1000),
      cancelAtPeriodEnd, cancelAt, checkoutSessionId: binding.checkoutSessionId, fence};
```

说明：把「有 `cancel_at`」也记成 `cancelAtPeriodEnd=true`，可让现有 UI / Checkout 语义立刻正确；`cancelAt` 另存便于展示确切日期。若 `cancel_at` 不在期末（极少见），仍按「已排期取消」处理，与 SC-BIL-09「期末取消」证据一致即可。

### 2.2 `src/db/schema/billing.ts`（`billingSubscriptions`，约第 84 行旁）

在 `cancelAtPeriodEnd` 后增加：

```ts
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  cancelAt: timestamp('cancel_at', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
```

### 2.3 新迁移 `src/db/migrations/0032_billing_subscription_cancel_at.sql`

当前最新是 **`0031_operator_owner_state.sql`**（`schema_ownership.version = 32`）。下一号为 **`0032`**，ownership 写成 **`33`**：

```sql
alter table app.billing_subscriptions add column if not exists cancel_at timestamptz;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 33)
on conflict (key) do update
set owner = excluded.owner, version = greatest(app.schema_ownership.version, excluded.version);
```

并在 `src/db/migrations/meta/_journal.json` 的 `entries` 末尾追加（与现有条目同形）：

```json
    {
      "idx": 32,
      "version": "8",
      "when": 1780000032000,
      "tag": "0032_billing_subscription_cancel_at",
      "breakpoints": true
    }
```

本地迁移：`npm run db:migrate`（见 `package.json` 的 `db:migrate`）。Staging 按你们现有 Railway/部署迁移流程跑同一文件。

### 2.4 `src/modules/billing/subscriptions.ts`

**类型 `SubscriptionObservation`（约第 23 行旁）**：

```ts
  cancelAtPeriodEnd?: boolean;
  cancelAt?: Date | null;
  now?: Date;
```

**`mirrorSubscription` 更新分支（约第 81–82 行）** — 显式传入时覆盖（含 `null` 清除）；未传则保留旧值：

```ts
      const nextCancelAtPeriodEnd = input.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd;
      const nextCancelAt = input.cancelAt !== undefined ? input.cancelAt : existing.cancelAt;
      await tx.update(billingSubscriptions).set({status: input.status, periodStart: effectivePeriodStart, periodEnd: effectivePeriodEnd, cancelAtPeriodEnd: nextCancelAtPeriodEnd, cancelAt: nextCancelAt, updatedAt: now}).where(eq(billingSubscriptions.id, existing.id));
      return {...existing, status: input.status, periodStart: effectivePeriodStart, periodEnd: effectivePeriodEnd, cancelAtPeriodEnd: nextCancelAtPeriodEnd, cancelAt: nextCancelAt, updatedAt: now};
```

**插入（约第 85 行）**：

```ts
    await tx.insert(billingSubscriptions).values({id, workspaceId: input.workspaceId, provider: input.provider, customerId, externalId, catalogSnapshot: catalog, status: input.status, periodStart, periodEnd, cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false, cancelAt: input.cancelAt ?? null, createdAt: now, updatedAt: now});
```

**`markSubscriptionCanceled`（约第 101–102 行）** — 终态取消时清掉排期字段：

```ts
    await tx.update(billingSubscriptions).set({status: 'canceled', cancelAtPeriodEnd: false, cancelAt: null, updatedAt: now}).where(eq(billingSubscriptions.id, subscription.id));
    return {...subscription, status: 'canceled' as const, cancelAtPeriodEnd: false, cancelAt: null, updatedAt: now};
```

### 2.5 `src/app/(app)/workspaces/[w]/billing/page.tsx`（约第 85 行）

现有：

```tsx
<small>{subscription.cancelAtPeriodEnd ? 'Cancellation at period end' : 'No scheduled cancellation'}</small>
```

建议改为（继续用现有 `formatDate`；有 `cancelAt` 时带出日期）：

```tsx
<small>{subscription.cancelAtPeriodEnd
  ? (subscription.cancelAt ? `Cancellation scheduled ${formatDate(subscription.cancelAt)}` : 'Cancellation at period end')
  : 'No scheduled cancellation'}</small>
```

若账单查询 DTO 未透出 `cancelAt`，在组装 `view.subscriptions` 的同一处（`src/modules/billing/queries.ts` 等）把 DB 列一并带出；字段名与 schema 一致即可。

### 2.6（可选）`src/modules/operations/workspace-details.ts`

约第 40 行 select 已含 `cancelAtPeriodEnd`；若要做 admin 核对，可同样选出 `cancelAt`。非关 UI 证据的硬性项。

---

## 3) 迁移 / Drizzle 步骤汇总

1. 新增 `src/db/migrations/0032_billing_subscription_cancel_at.sql`（上文 SQL）。
2. 更新 `src/db/migrations/meta/_journal.json`（`idx: 32`，`tag: 0032_billing_subscription_cancel_at`）。
3. 改 `src/db/schema/billing.ts` 的 `cancelAt`。
4. 本机：`npm run db:migrate`。
5. 部署 Staging 时确保迁移先于/随应用发布执行。

不要用手写改 production 列而不走 migrations；不要改 `0016_billing_contracts.sql` 历史文件。

---

## 4) 测试

### 4.1 `tests/unit/stripe-test-events.test.ts`

现有 harness 里 `subscription`（约第 38 行）带 `cancel_at_period_end: true`。在「subscription lifecycle normalization…」测试旁**新增**用例：

```ts
test('portal-style cancel_at schedules cancellation even when cancel_at_period_end is false', async () => {
  const h = harness('subscription');
  h.subscription.cancel_at_period_end = false;
  h.subscription.cancel_at = Math.floor(h.item.current_period_end); // 若 harness 未挂 item，用 subscription.items.data[0].current_period_end
  const discovery = await h.mapper.discover(event('customer.subscription.updated', 'subscription', 'sub_Mapper'));
  const observation = await h.mapper.normalizeSubscription(discovery, binding('subscription'), fence);
  assert.equal(observation!.cancelAtPeriodEnd, true);
  assert.equal(observation!.cancelAt!.toISOString(), new Date(h.subscription.cancel_at * 1000).toISOString());
});

test('clearing cancel_at un-schedules cancellation', async () => {
  const h = harness('subscription');
  h.subscription.cancel_at_period_end = false;
  h.subscription.cancel_at = null;
  const discovery = await h.mapper.discover(event('customer.subscription.updated', 'subscription', 'sub_Mapper'));
  const observation = await h.mapper.normalizeSubscription(discovery, binding('subscription'), fence);
  assert.equal(observation!.cancelAtPeriodEnd, false);
  assert.equal(observation!.cancelAt, null);
});
```

注意：harness 里 `subscription` / `item` 是否可写取决于现有闭包；若属性只读，用本地构造对象覆盖 `client.subscriptions.retrieve`，风格对齐文件中其它 mock 覆盖写法。

保留原断言 `cancel_at_period_end: true` → `cancelAtPeriodEnd === true`。

### 4.2 `tests/integration/stripe-reconciliation.test.ts`

约第 124–125 行已测 `cancelAtPeriodEnd: true`。追加：`mirrorSubscription(..., { cancelAtPeriodEnd: true, cancelAt: periodEnd })` 后读回 `cancelAt`；再 `mirrorSubscription(..., { cancelAtPeriodEnd: false, cancelAt: null })` 确认清除。

本机跑：

```powershell
cd D:\github\shpitto
npm test -- tests/unit/stripe-test-events.test.ts
# 以及你们现有的 integration 命令（若需 DB）
```

---

## 5) Staging 验证（部署后）

1. 确认迁移已应用：`billing_subscriptions` 有 `cancel_at`。
2. **任选其一**触发再镜像：
   - Stripe Dashboard / CLI **重放** `evt_1UXyOjRcvKApiJYWsCPe2EWM` 到 Staging webhook  
     `https://shpitto-m4-web-production.up.railway.app/api/webhooks/stripe?source=acceptance`；或
   - 在 Portal 再取消一次 / 先恢复再取消（TEST）。
3. 打开  
   `https://shpitto-m4-web-production.up.railway.app/workspaces/ab0d1ea5-f538-4b4b-8c59-698b5d7c5d39/billing`
4. **期望 UI**：Subscriptions 仍为 `active`，文案为 **`Cancellation at period end`** 或 **`Cancellation scheduled Dec 3, 2026`**（取决于你是否采用带日期的文案），**不是** `No scheduled cancellation`。
5. Monthly「Open checkout」仍应返回  
   `A nonterminal subscription already exists for this workspace.`（既有 guard，与本次修复无关）。
6. 将截图与 Stripe 读回归档到证据目录；**SC-BIL-09 仍可能 BLOCKED**（例如 catalog 不迁移等），**不要自写 stage PASS**。

---

## 6) 范围外 / 不要动

- 不要改 Checkout `assertNoActiveSubscription` 逻辑（已对 `active` 生效）。
- 不要改 Portal configuration / `stripe-test.ts` 建 session 流程（除非另开 UX 任务）。
- 不要为修这个 bug 去碰 FirstPromoter、live mode、退款/争议场景。
- 不要改历史迁移 `0016_*`；不要在证据分支上直接标 `SC-BIL-09 PASS` 或 `M5 PASS`。
- 不要用 CloudAgent；本机改完、测完、再按你们流程部署 Staging。

---

## 7) 建议提交信息（本地）

```text
fix(billing): mirror Stripe cancel_at as scheduled cancellation (portal cancel)
```

合并进主线后再在 soft-launch 证据里补「修复后复验」记录。