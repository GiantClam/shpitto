# STATUS — Session URL soft-launch probe / 软发 Session URL 探测

日期 date（Asia/Shanghai）：2026-11-03  
目录 path：`internal/evidence/acceptance/M5/m5-soft-launch-20261103/session-url-probe-20261103/`

## Status keys（中英对照）

| key | value | 说明 zh |
|-----|-------|---------|
| `m5_stage_status` | `IN_PROGRESS` | **M5 阶段仍为进行中；本归档不宣称 PASS** |
| `acceptance_status_m5` | `IN_PROGRESS`（unchanged） | **未**改 `openspec/.../acceptance-status.json` 为 PASS |
| `session_url_soft_launch_item` | `probe-pass` | 仅针对 **API 直建** hosted Session 的浏览器探测 |
| `api_hosted_session_probe` | `PASS_probe_card_form` | 卡表单可见；非 incomplete；**未完成支付** |
| `staging_app_handoff_reverify` | `PENDING` | Staging 应用侧创建/跳转路径仍待复验 |
| `stripe_account_onboarding` | `INCOMPLETE` | `details_submitted=false` 等仍未翻 true |
| `staging_web_deploy` | `SUCCESS` | tip `29816c2` / PR #10 squash 已上 Staging |
| `soft_launch_session_url_closed` | `false` | Session URL 软发项 **未关单**（应用路径仍开） |

## Facts archived / 已归档事实

### Staging web deploy
- result：`SUCCESS`
- deployment id：`81fa8c1f…`（prefix; full id truncated in prose）
- commit：`29816c283450260cff9ac05e206ddbfc9b2b9e07`（PR #10 squash）
- when（Asia/Shanghai）：约 2026-11-03 16:16–16:17
- service：`shpitto-m4-web`
- env：`STRIPE_CHECKOUT_UI_MODE` **变量名**已在服务上可见（Railway OAuth MCP 读不到值；先前设为 `hosted` 且 skipDeploys）

### Stripe account flags（API read 2026-11-03）
- account：`acct_1USYQxRcvKApiJYW`
- `details_submitted=false`
- `charges_enabled=false`
- `payouts_enabled=false`
- `tos_acceptance=null`
- `disabled_reason=requirements.pending_verification`
- raw：`raw/stripe-account-flags.json`

### API hosted Session create
- price：`price_1USZScRcvKApiJYWdi3iaGxJ`（$9）
- session id：`cs_test_a1BRjBZ7BtzOsemENBNU2tB4DqBvahDeAxKjNyVxpr1k0rf8uzzcBRYTkl`
- `ui_mode=hosted_page`，`status=open`，`client_secret=null`
- url host：`checkout.stripe.com`
- raw：`raw/checkout-session-probe.json`

### Browser probe
- result：`PASS_probe_card_form`
- saw：Sandbox product $9.00；Contact/Email；Payment method Card / Cash App / Klarna / Bank；Pay button
- not：“This link is incomplete”
- payment：**not** completed
- screenshot：lived on box agent desktop/assets during probe；**binary not copied** into this evidence tree（path not reliably reachable for archive copy）

### Still open
- Staging **app** handoff reverify：`PENDING`
- Stripe Dashboard onboarding still incomplete despite probe card form
- M5 remains `IN_PROGRESS`

## Explicit non-claims / 明确不声称

- 不把 M5 标为 PASS / Do **not** invent PASS for M5 stage  
- 不改 acceptance-status → PASS  
- Soft-launch Session URL **item** 仅可记为 API hosted `probe-pass`；Staging UI/app path 仍 open  
- 本探测 ≠ 软发 Session URL 关单；≠ 测试卡对账完成  
