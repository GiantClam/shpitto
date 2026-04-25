# Project Analysis 数据分析完整方案（Cloudflare）

## 1. 背景与目标

当前产品目标：

1. 每个用户的每个 `project` 仅有一个正式线上站点（生产链接）。
2. 用户点击发布部署后，平台自动开始监控该链接的数据。
3. 在 `project` 的 `Analysis` 页面展示核心指标，帮助用户快速判断线上效果。
4. 用户通常不懂域名迁移/DNS 细节，方案必须尽量零配置。

目标指标：

- 访问量（Visits）
- 浏览量（Page Views）
- 跳出率（Bounce Rate）
- 访问时长（Avg Session/Visit Duration）
- 来源（直接/搜索/社交/引荐）
- 分页面维度数据（按路径）

---

## 2. 关键结论（架构决策）

基于当前项目现状与 Cloudflare 能力，采用如下主方案：

1. 默认采集链路：`Cloudflare Web Analytics + GraphQL API`。
2. 默认不采用 Zaraz 作为基础统计方案。
3. 对 not proxied 容量限制（上限 10）建立分层容量预案。
4. 中长期将高规模租户迁移到 `Cloudflare for SaaS / Custom Hostnames`，解除 not proxied 瓶颈。

决策原因：

- Web Analytics 可通过脚本采集，用户侧改造最小，适配“低配置门槛”。
- GraphQL 便于做统一后端查询与租户隔离。
- Zaraz 在 Pages 场景下的门槛更高（启用需 custom domain），不适合作为默认路径。

> 时间说明：本方案基于 2026-04-23 可验证官方文档信息。

---

## 3. 为什么不是默认 Zaraz

Zaraz 适合高级营销/标签编排，但不适合作为当前项目的默认基础分析方案：

1. Cloudflare Pages 上启用 Zaraz 需要先绑定 custom domain（仅 `*.pages.dev` 不满足）。
2. 目标用户不熟悉域名迁移与 DNS 细节，接入阻力高。
3. 你当前核心诉求是“部署即看基础数据”，而不是先做标签治理平台。

结论：

- Zaraz 作为可选高级功能（Enterprise/高级套餐）保留。
- 默认路径以 Web Analytics 为主。

---

## 4. 总体架构

### 4.1 逻辑架构

1. 采集层
- 在每个 project 发布产物 HTML 中自动注入 Cloudflare beacon snippet（使用该 project 专属 `site_tag`）。

2. 数据层
- Cloudflare Web Analytics 托管原始采集与聚合。
- 平台后端通过 Cloudflare GraphQL API 拉取聚合数据。
- D1 仅存映射与缓存，不存全量原始埋点。

3. 服务层
- 新增 `Analysis API`（服务端鉴权 + project 归属校验 + GraphQL 查询 + 结果标准化）。

4. 展示层
- 新增 `projects/[projectId]/analysis` 页面与 workspace。
- 与 Chat/Assets 保持一致导航。

### 4.2 租户隔离

以 `project_id -> cf_site_tag` 作为查询隔离主键：

1. 前端只传 `projectId + 时间范围`。
2. 后端根据登录用户校验 project 所有权。
3. 后端用服务端 token 查 GraphQL，并强制附加 `siteTag` 过滤。
4. 绝不向前端暴露 Cloudflare API token。

---

## 5. 当前项目落地接入点

### 5.1 已有代码基础（可复用）

1. 部署链路
- `apps/web/lib/skill-runtime/executor.ts`
- `apps/web/lib/agent/graph.ts`
- `apps/web/lib/cloudflare.ts`
- `apps/web/lib/bundler.ts`

2. 数据持久化
- `apps/web/lib/d1.ts`
- `apps/web/lib/agent/db.ts`
- 现有表：`shpitto_projects`、`shpitto_deployments`、`shpitto_project_sites`

3. 项目页路由
- 已有：`chat`、`assets`
- 待加：`analysis`

### 5.2 需要新增/调整

1. D1 schema 扩展（建议加在 `shpitto_project_sites`）
- `cf_wa_site_id TEXT`
- `cf_wa_site_tag TEXT`
- `cf_wa_host TEXT`
- `analytics_provider TEXT DEFAULT 'cloudflare_web_analytics'`
- `analytics_status TEXT DEFAULT 'pending'`
- `analytics_last_sync_at TEXT`

2. Cloudflare 客户端扩展（`apps/web/lib/cloudflare.ts`）
- `ensureWebAnalyticsSite(host): { siteId, siteTag }`
- `queryAnalyticsBySiteTag(...)`

3. 部署阶段注入 snippet（`bundler` 前）
- 仅处理 `text/html` 文件。
- 将 snippet 注入 `</body>` 前。

4. Analysis API
- 新增：`apps/web/app/api/projects/[projectId]/analysis/route.ts`
- 鉴权模式与 `assets` API 一致（Supabase user）。

5. Analysis 页面
- 新增：`apps/web/app/projects/[projectId]/analysis/page.tsx`
- 新增：`apps/web/components/chat/ProjectAnalyticsWorkspace.tsx`
- 更新 `ProjectChatWorkspace.tsx`、`ProjectAssetsWorkspace.tsx` 的 `Analytics` 导航为可点击。

---

## 6. 指标能力设计

### 6.1 V1（保证上线）

强保证指标：

1. `visits`
2. `pageViews`
3. 分页面维度（`requestPath`）
4. 来源基础维度（`refererHost` / `refererPath`）
5. 性能基础（可从 RUM 数据集取）

### 6.2 V1.1（条件能力）

`bounceRate`、`avgDuration` 先按“能力探测”处理：

1. 启动时或定时做 GraphQL schema 探测（introspection）。
2. 若字段存在，直接展示。
3. 若字段缺失，UI 标注“暂不可用”。

### 6.3 V2（兜底补齐）

若业务必须稳定提供跳出率/时长：

1. 追加内置轻量采集（Workers + Analytics Engine + D1 rollup）。
2. 只补齐缺失指标，不替换 Web Analytics 主链路。

---

## 7. 来源分类规则（统一口径）

后端标准化来源为以下四类：

1. `direct`：无 referer / 空 referer。
2. `search`：匹配常见搜索引擎域名（google/bing/baidu/yandex 等）。
3. `social`：匹配社媒域名（x/twitter/facebook/instagram/linkedin/weibo 等）。
4. `referral`：其余外部来源。

说明：

- 分类逻辑放后端，前端只做展示。
- 便于后续统一修正规则，不影响前端。

---

## 8. 容量限制与扩展策略

已知风险：

- Cloudflare Web Analytics 对 not proxied 站点存在数量限制（文档给出 10）。

分层预案：

1. L1（立即可用）
- 设配额守卫：当账户 not proxied 站点使用量达到阈值（如 8/10）时告警。
- 超阈值时新项目自动切到内置采集 provider（不阻塞用户发布）。

2. L2（短期缓解）
- 向 Cloudflare Support 申请 soft limit 调整。

3. L3（长期根治）
- 上线 `Cloudflare for SaaS + Custom Hostnames`。
- 通过客户 CNAME 接入，把高价值/高流量租户迁移到 proxied 路径，解除 not proxied 约束。

---

## 9. Cloudflare for SaaS 开通与接入流程

平台侧一次性开通：

1. 将平台 SaaS zone 接入 Cloudflare。
2. 在 Custom Hostnames 页面 `Enable`（非 Enterprise 需支付信息）。
3. 创建并设置 `fallback origin`（必须 Proxied）。
4. 建议创建统一 `CNAME target`（如 `customers.yourdomain.com`）。

租户接入（每个域名）：

1. 平台通过 API 创建 `custom hostname`。
2. 返回校验信息（TXT/HTTP）并引导租户完成校验。
3. 租户在其 DNS（如 DNSPod）添加 CNAME 到你的 `CNAME target`。
4. 待证书状态与主机状态均 Active 后切流。

核心 API：

- `POST /zones/{zone_id}/custom_hostnames`
- `PUT /zones/{zone_id}/custom_hostnames/fallback_origin`

---

## 10. 安全与合规

1. Token 最小权限
- 分离部署 token 与 analytics token。
- analytics token 仅保留读取相关权限。

2. 服务端代理
- 所有 GraphQL 请求由后端发起。
- 前端不保存任何 Cloudflare 密钥。

3. 数据最小化
- D1 仅存映射和缓存聚合，不存全量行为明细。

4. 审计
- 记录每次 Analysis 查询的 `projectId`、调用用户、时间范围、响应状态。

---

## 11. 分阶段实施计划

### Phase 1（1-2 周）：可上线版本

1. D1 schema 扩展。
2. 部署链路自动创建 Web Analytics site_tag。
3. 自动注入 snippet。
4. 新增 `/api/projects/[projectId]/analysis`。
5. 新增 Analysis 页面（PV/Visits/来源/页面 Top）。
6. 配额守卫 + 基础告警。

验收标准：

1. 用户发布后 5-15 分钟内 Analysis 页可见数据。
2. 不需要用户手动配置埋点。
3. 多租户查询严格隔离。

### Phase 2（2-4 周）：指标增强

1. GraphQL schema 探测与动态字段能力。
2. 性能指标图表（LCP/FCP/TTFB 等可用字段）。
3. 缓存与查询优化（短 TTL 缓存 + 限流）。

### Phase 3（4-8 周）：规模化

1. 上线 Cloudflare for SaaS 域名接入流程。
2. 租户域名托管中心（状态、校验步骤、错误提示）。
3. 高规模租户迁移到 proxied 路径。

---

## 12. 风险清单与应对

1. 风险：Web Analytics not proxied 配额触顶
- 应对：配额守卫 + provider fallback + SaaS custom hostname 迁移。

2. 风险：GraphQL 字段与预期不一致
- 应对：schema introspection + 字段能力探测 + UI 软降级。

3. 风险：部署后数据延迟导致用户误判
- 应对：UI 显示“数据同步中”状态与最近刷新时间。

4. 风险：Token 泄露
- 应对：仅服务端持有 + 最小权限 + 定期轮换。

---

## 13. 最终推荐

最终推荐方案：

1. 以 `Cloudflare Web Analytics + GraphQL` 作为默认主链路，快速实现低配置上线。
2. 不把 Zaraz 作为默认能力，仅保留为高级可选。
3. 立即建设容量治理与 fallback 机制，避免被 not proxied 限制卡住。
4. 将 `Cloudflare for SaaS / Custom Hostnames` 作为规模化核心工程，逐步把高价值租户迁移到 proxied 路径。

该方案与当前 `shpitto` 代码结构兼容，改造点集中、风险可控、可分阶段发布。

---

## 14. 参考文档（官方）

1. Cloudflare Web Analytics
- https://developers.cloudflare.com/web-analytics/about/
- https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/
- https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/
- https://developers.cloudflare.com/web-analytics/faq/
- https://developers.cloudflare.com/web-analytics/limits/

2. Cloudflare GraphQL Analytics API
- https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
- https://developers.cloudflare.com/analytics/graphql-api/limits/

3. Zaraz 与 Pages
- https://developers.cloudflare.com/pages/how-to/enable-zaraz/
- https://developers.cloudflare.com/zaraz/advanced/domains-not-proxied/

4. Cloudflare for SaaS / Custom Hostnames
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/enable/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/
- https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/
- https://developers.cloudflare.com/api/resources/custom_hostnames/subresources/fallback_origin/methods/update/
