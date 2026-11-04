# STATUS — Staging app-path Session URL soft-launch reverify

日期 date（Asia/Shanghai）：2026-11-04  
目录 path：`internal/evidence/acceptance/M5/m5-soft-launch-20261103/session-url-staging-app-20261104/`

## Status keys（中英对照）

| key | value | 说明 zh |
|-----|-------|---------|
| `m5_stage_status` | `IN_PROGRESS` | **M5 阶段仍为进行中；本归档不宣称 PASS** |
| `acceptance_status_m5` | `IN_PROGRESS`（unchanged） | **未**改 `openspec/.../acceptance-status.json` 为 PASS |
| `session_url_soft_launch_item` | `PASS_staging_app_card_form` / **closed** | Staging **应用路径** hosted Checkout 出卡表单；软发 Session URL 项可关 |
| `staging_app_handoff_reverify` | `PASS_card_form` | 账单页 Open checkout → hosted Session 卡表单；非 incomplete |
| `soft_launch_session_url_closed` | `true` | Session URL 软发项 **已关单**（仅 Session URL；≠ M5 PASS） |
| `payment_attempted` | `false` | **未**尝试付款 / 未对账 |
| `api_hosted_session_probe` | （prior）`PASS_probe_card_form` | 见并列目录 `session-url-probe-20261103/`（`cs_test_a1BRjBZ7…`）；本目录为 **app-path** |
| `stripe_account_onboarding` | `INCOMPLETE`（unchanged note） | 账号入驻仍可能 incomplete；本复验未重读 flags |
| `staging_web_deploy` | `SUCCESS`（prior tip） | tip `29816c28…` / PR #10；aipc `origin/main` 仍指向该 tip（2026-11-04 fetch） |

## Facts archived / 已归档事实

### Path under test
- kind：**Staging app path**（signed-in workspace → billing → Open checkout），**not** raw Stripe API create
- billing URL：`https://shpitto-m4-web-production.up.railway.app/workspaces/ab0d1ea5-f538-4b4b-8c59-698b5d7c5d39/billing`
- workspace name：`aff-m6-readback-1101`
- workspace id：`ab0d1ea5-f538-4b4b-8c59-698b5d7c5d39`
- product UI：Permanent credit pack **USD 9.00** → Open checkout

### Hosted Checkout Session
- session id：`cs_test_a1parlBzuYGLBtTwgBAImpTvEU9MclUMyJCraoWTd42i3GvWaD4pz8YDvf`
- checkout URL host：`checkout.stripe.com`（path `/c/pay/cs_test_a1parlBzuYGLBtTw…`）
- product：Shpitto test-only acceptance product，**$9.00**
- merchant sandbox label：`shpitto-acceptance-20261020 sandbox`

### Browser reverify（2026-11-04 Asia/Shanghai）
- verdict：`PASS_card_form`
- saw：card number / expiry / CVC fields（卡表单可见）
- not：“This link is incomplete”
- payment：**NOT** attempted
- screenshot：`screenshots/hosted-checkout-card-form.png`（present in tree）

### Deploy tip note
- Staging tip previously deploy SUCCESS on main `29816c283450260cff9ac05e206ddbfc9b2b9e07`（PR #10）
- aipc `git fetch origin main`（2026-11-04）：`origin/main` **still** `29816c28…` — no newer tip observed on remote main at archive time

### Relation to prior API probe
- Prior API-only probe：`cs_test_a1BRjBZ7…` → `session-url-probe-20261103/`（`PASS_probe_card_form`；`soft_launch_session_url_closed=false` 当时因 app path 仍 PENDING）
- This archive closes soft-launch Session URL via **Staging app-path** reverify

## Explicit non-claims / 明确不声称

- **Do not** invent M5 stage PASS / 不把 M5 标为 PASS  
- **Do not** set acceptance-status M5 → PASS  
- Soft-launch Session URL closed ≠ full M5 acceptance；payment / webhook 对账仍未做  
- `details_submitted` 等账号入驻未在本复验中重验为 true  

## Raw / screenshots
- `raw/checkout-session-app-path.json`
- `screenshots/hosted-checkout-card-form.png`
