# Checkout Session URL — 本机修改计划（步骤 1–2 已合入 Staging tip 29816c2；Staging 应用路径 Session URL 已复验 PASS_card_form）

日期（Asia/Shanghai）：2026-11-03（状态更新 2026-11-04）  
依据：`CHECKOUT_SESSION_URL_PLAN.md`、`internal/evidence/acceptance/stripe-test-pack-20261029/HOSTED_CHECKOUT_URL_DEFECT.md`  
用户决策：修好跳转链接后再验（不做“只走 embedded”书面例外）。

**当前状态（2026-11-04 Asia/Shanghai 更新）：** 步骤 1–2 代码已合入 `main` tip `29816c283450260cff9ac05e206ddbfc9b2b9e07`（PR #10 squash）并部署 Staging web SUCCESS。API 直建 hosted Session（`cs_test_a1BRjBZ7…`）浏览器探测为 `PASS_probe_card_form`（见 `session-url-probe-20261103/`）。**Staging 应用侧**（账单 → Open checkout → hosted Session `cs_test_a1parlBzuYGLBtTw…`）浏览器复验为 **`PASS_card_form`**（卡号/有效期/CVC 可见；非 incomplete；**未付款**）。证据：`session-url-staging-app-20261104/`。**`soft_launch_session_url_closed=true`**（软发 Session URL 项已关）。**M5 / acceptance-status 仍为 `IN_PROGRESS` — 禁止写成 PASS。** aipc `origin/main` 于 2026-11-04 fetch 仍为 tip `29816c28…`（未见更新 tip）。

---


## 1. 问题一句话

用户点「跳转到 Stripe 完整付款页」时，拿到的 `checkout.stripe.com` 链接打开后是 **“This link is incomplete”**，没有刷卡表单。  
同账号下 **Embedded（站内嵌套）付款已经能付**（$9 包、$25 月订都已用 embedded 付过）。

---

## 2. 两个根因（必须都处理）

### A. Stripe 账号入驻未完成（运维，无代码）

账号：`acct_1USYQxRcvKApiJYW`（test）

| 标志 | 2026-11-03 观测 |
|------|-----------------|
| `details_submitted` | **false** |
| `charges_enabled` | **false** |
| `payouts_enabled` | **false** |

证据：`raw/stripe-account-flags.json`  
**只改代码、不完成 Dashboard 入驻 → hosted URL 仍会 incomplete。**

### B. 应用代码强制 Embedded，且桥接层丢掉 hosted URL

| 文件 | 现状 |
|------|------|
| `src/adapters/billing/stripe-test.ts` | `createCheckout` 写死 `ui_mode: 'embedded_page'`；`checkoutValue` 在 `creating` 时 `requireValue(embedded)`；embedded 时 `url` 固定为 `null` |
| `src/adapters/billing/stripe-checkout.ts` | `createCheckout` 桥：open 会话若无 `clientSecret` 直接 `{unknown:true}`；成功时也 **`url: null`** |
| `src/components/billing/checkout-handoff.ts` | `resolveCheckoutHandoff`：有 clientSecret → embed；否则有 `checkoutUrl` → redirect。**逻辑可保留** |

---

## 3. 推荐顺序（先运维，再本机改代码）

### 步骤 0 — Stripe Dashboard（先做）

1. 打开 Stripe Dashboard（**Test mode**），账号 `acct_1USYQxRcvKApiJYW`。  
2. 完成 Business / details 要求，直到：
   - `details_submitted=true`
   - 尽量 `charges_enabled=true`（test）
3. 用与归档相同的非密钥读法复验，例如 `railway run` + `stripe.accounts.retrieve()`，更新 `raw/stripe-account-flags.json`。  
4. **未翻成 true 之前，不要指望 hosted URL 复验通过。**

### 步骤 1 — 本机改 `stripe-test.ts`（本地，禁止本任务 cloud 编码）

目标：能创建 `hosted_page` Session，并返回可用的 `checkout.stripe.com` URL。

建议改法（二选一，优先配置开关）：

1. **推荐**：用环境变量控制，例如 `STRIPE_CHECKOUT_UI_MODE=hosted|embedded`（默认可先仍 `embedded`，验 hosted 时再切 `hosted`）。  
2. 或临时把 `ui_mode: 'embedded_page'` 改为 `'hosted_page'`（验证期用，长期不如开关清晰）。

具体触点：

- `createCheckout` 的 `SessionCreateParams`：
  - hosted：`ui_mode: 'hosted_page'`，需要 `success_url` / `cancel_url`（或项目约定的 return URL 形态）；**不要**依赖 `client_secret`。  
  - embedded：保持现有 `redirect_on_completion` + `return_url` + `client_secret`。
- `checkoutValue(...)`：
  - 去掉或放宽 `if (creating) requireValue(embedded)`，改为：creating 时允许 embedded **或** hosted。  
  - hosted + `status==='open'`：必须有非空 `session.url`，且 host 为 `checkout.stripe.com`；`clientSecret` 应为 `null`。  
  - embedded：继续要求 open 时有 `clientSecret`，且 `url === null`。

### 步骤 2 — 本机改 `stripe-checkout.ts` 桥

`createStripeCheckoutProvider().createCheckout` 当前对 open 会话：

```ts
if (value.status !== 'open' || !value.clientSecret) return {unknown: true, sessionId: value.sessionId};
return {sessionId, url: null, clientSecret: value.clientSecret, status: 'open'};
```

应改为（语义）：

- open + **有** `clientSecret` → embed：`{sessionId, url: null, clientSecret, status:'open'}`  
- open + **无** `clientSecret` 但 **有** `url` → redirect：`{sessionId, url: value.url, clientSecret: null, status:'open'}`  
- 两者都没有 → `{unknown:true, ...}`

`retrieveCheckout` 已会带上 `value.url`，一般可不动；确认 UI 读的是 `checkoutUrl` 字段映射。

### 步骤 3 — UI handoff（通常不用改）

`resolveCheckoutHandoff` 已支持：secret → embed；否则 `checkoutUrl` → redirect。  
只要 API 响应在 hosted 模式下提供 `checkoutUrl`（且无 secret），就会走跳转。

### 步骤 4 — 测试（本机）

建议扩展：

- `tests/integration/stripe-checkout.test.ts`（或同目录相关用例）  
- `tests/unit` 里 handoff / bridge：分别覆盖 embedded 与 hosted 两种 open 形状  

至少断言：

1. hosted create → 返回非空 `url`，无 `clientSecret`  
2. embedded create → 返回 `clientSecret`，`url` 为空  
3. handoff：secret 优先于 url  

### 步骤 5 — 部署 Staging 并复验（修复后才做）

1. 本机改完并过测试 → 提交/部署 Staging（**本任务不执行编码与部署**）。  
2. 确认账号 flags 已 true。  
3. Staging 创建 Checkout（月订或 pack 均可，标明 mode）。  
4. 浏览器打开返回的 Session URL：
   - **通过**：出现卡表单（不是 incomplete）  
   - 用测试卡付一笔 → webhook 对账  
5. 归档证据后，才可把软发清单里 Session URL 标为 CLOSED。

---

## 4. 复验清单（全勾才算软发 Session URL 关单）

- [ ] `details_submitted=true`（必要时 `charges_enabled=true`）  
- [x] 新 Session create 返回 `checkoutUrl`，host 为 `checkout.stripe.com`（Staging app-path 2026-11-04）  
- [x] 浏览器打开为卡表单，不是 “incomplete”（`PASS_card_form`；见 `session-url-staging-app-20261104/`）  
- [ ] 测试卡支付并对账成功  
- [x] 证据写入 M5 soft-launch：`session-url-staging-app-20261104/` + 先前 `session-url-probe-20261103/`  
- [ ] **仍不**自动等于 M5 阶段 PASS  

---

## 5. 明确禁止

- 在未复验前声称「Checkout Session URL 已修好」  
- 弱化 `env.ts` fail-closed 或拆掉 harness 来“绕过”测试  
- 把本计划文件当成已经改过代码的证明  
- 用 soft-launch 证据把 `acceptance-status` 的 M5 写成 PASS  

---

## 6. 你本机下一步（最短路径）

1. Stripe Dashboard 完成 test 账号 details（步骤 0）。  
2. 按步骤 1–4 在 **aipc 本地**改上述 2 个 adapter 文件 + 测试。  
3. 部署 Staging 后叫执行端复验步骤 5。  
4. 复验绿之前，对外只说：**付款走 Embedded；hosted Session URL 仍未关。**


---

## 7. 2026-11-04 Staging 应用路径复验（归档）

- 路径：已登录 Staging → billing → Permanent credit pack USD 9.00 → Open checkout  
- Session：`cs_test_a1parlBzuYGLBtTw…` → `checkout.stripe.com` 卡表单（`PASS_card_form`）  
- 支付：未尝试  
- 软发 Session URL：`soft_launch_session_url_closed=true`  
- **仍不**等于 M5 PASS；测试卡对账、账号入驻 flags 等仍可能未关  
- 证据目录：`session-url-staging-app-20261104/`


