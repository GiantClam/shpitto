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

---

## 15. Prompt Draft Content Enrichment Plan

This section defines the implementation plan for improving website Prompt Draft depth before generation.

### 15.1 Goal

Prompt Draft generation must not rely on a shallow user sentence when richer content can be gathered. Before generation, Shpitto builds a Website Knowledge Profile from four possible content sources:

1. New website details supplied by the user.
2. Existing domain or old website content.
3. Uploaded project files.
4. Industry research from web search.

The Prompt Draft should use verified or user-provided facts first, and mark unsupported assumptions explicitly.

### 15.2 Required Content Source Slot

Add a required `content-source` slot to the pre-generation form:

- `new_site`: New website, no existing content.
- `existing_domain`: Existing domain or old website.
- `uploaded_files`: Uploaded materials.
- `industry_research`: Use industry research.

If the user chooses `new_site`, the UI must guide the user to provide brand positioning, core services, advantages, cases, credentials, data, and conversion goals. If these are missing, Prompt Draft output must identify the content gaps.

### 15.3 Web Search Query Policy

Using only two web search queries is not sufficient. Query budget must be adaptive:

- Domain present: default 6 queries.
- Industry research requested and no domain: default 5 queries.
- Generic website request: default 3 queries.
- Environment override: `CHAT_DRAFT_WEB_SEARCH_MAX_QUERIES`.

When a domain exists, search must prioritize:

- `site:domain`
- `domain`
- `site:domain about OR company OR profile OR intro`
- `site:domain products OR services OR solutions`
- `site:domain cases OR news OR blog OR research`
- `site:domain contact`

### 15.4 Domain Extraction And Same-Domain Content

If the user provides a domain, the system must:

1. Extract the domain from the requirement text.
2. Run domain-prioritized web search.
3. Fetch readable same-domain pages from search results and common home URLs.
4. Extract title, meta description, body text, offerings, proof points, and gaps.
5. Feed those facts into the Website Knowledge Profile.

Search snippets alone are not enough for deep website content.

### 15.5 Uploaded File Parsing

Uploaded assets referenced in chat should be treated as content sources. The system should resolve project asset references, read file bytes when possible, and extract text into the Website Knowledge Profile.

Cloudflare R2 is the source of truth for uploaded files. Prompt Draft ingestion must resolve files through the project asset manifest and read bytes by scoped R2 key (`ownerUserId + projectId + key`). Public asset URLs are fallback references only and must not be treated as trusted ownership proof.

Runtime policy:

- Run document ingestion in the Node.js runtime, not Edge, because R2 byte reads and local parsers need full Node APIs and longer execution windows.
- Do not direct-connect to OpenAI for uploaded file parsing.
- Parse uploaded files locally first, then send only extracted text and the Website Knowledge Profile into the existing AIBERM Prompt Draft flow.
- Keep normal website generation and Prompt Draft LLM calls on AIBERM Chat Completions.
- Never pass raw PDF internals into Prompt Draft. If deterministic extraction returns PDF object streams, treat the file as unparsed and use the local PDF parser or a content gap.

Supported deterministic extraction:

- `.txt`
- `.md`
- `.csv`
- `.json`
- `.html`
- `.xml`
- `.svg`

Supported local document parsers:

- PDF: `pdf-parse`
- DOCX: `mammoth`
- XLS/XLSX: `xlsx`
- PPTX: `jszip` plus OOXML slide text extraction

PDF policy:

- Try deterministic text extraction only when it produces natural readable text.
- If deterministic extraction is insufficient, parse the R2 PDF bytes locally with `pdf-parse`.
- If the PDF is image-only or local parsing returns too little text, record a content gap and ask for key facts or a text export instead of blocking the entire chat flow.

Office and OCR policy:

- DOCX/XLSX/PPTX are parsed locally before Prompt Draft.
- Legacy binary Office formats (`.doc`, `.ppt`) are not supported; ask for DOCX/PPTX/PDF/text export.
- Image-only PDFs and image OCR require a future OCR worker or provider. Do not direct-connect to OpenAI for this path unless the architecture decision changes.

Recommended environment:

```env
DOCUMENT_INGESTION_ENABLED=1
DOCUMENT_INGESTION_PROVIDER=local
DOCUMENT_INGESTION_LLM_PROVIDER=aiberm
DOCUMENT_INGESTION_MAX_FILE_MB=25
DOCUMENT_INGESTION_TIMEOUT_MS=45000
```

### 15.6 Website Knowledge Profile Contract

The profile contains:

- source mode
- domains
- source list
- brand summary
- audience signals
- offering signals
- differentiators
- proof points
- suggested pages
- content gaps

Prompt Draft generation must include this profile in the LLM input and attach it to timeline metadata for auditability.

### 15.7 Current Implementation Status

Implemented:

- Required content source slot in the pre-generation form.
- Adaptive web search query budget.
- Domain-prioritized search queries.
- Same-domain readable page extraction.
- Uploaded text-like file extraction from project assets stored in Cloudflare R2.
- Local PDF/DOCX/XLSX/PPTX extraction from R2 asset bytes.
- Explicit legacy Office and OCR gaps instead of fake binary extraction.
- Website Knowledge Profile injected into Prompt Draft generation.
- Prompt Draft metadata includes `websiteKnowledgeProfile`.

Deferred:

- OCR for image-only PDFs and uploaded images.
- Legacy `.doc` and `.ppt` binary parsing.
- Multi-page crawl depth beyond the first few same-domain search results.

### 15.8 AIBERM Production Model Policy

Use `openai/gpt-5.4-mini` as the default production model for AIBERM-backed website generation and Prompt Draft generation.

Recommended environment:

```env
LLM_MODEL_AIBERM=openai/gpt-5.4-mini
LLM_MODEL_FALLBACK_AIBERM=openai/gpt-5.4

CHAT_DRAFT_PROVIDER=aiberm
CHAT_DRAFT_MODEL=openai/gpt-5.4-mini
CHAT_DRAFT_FALLBACK_MODEL=openai/gpt-5.4
```

Rationale:

- AIBERM model listing confirms `openai/gpt-5.4-mini` and `openai/gpt-5.4` are available.
- Live probes confirmed `openai/gpt-5.4-mini` supports text, JSON mode, Chat Completions tool calling, tool-result continuation, Responses file input, and image input/OCR.
- Tool-calling production paths should continue to use Chat Completions because AIBERM's Responses API does not fully support the stateful `previous_response_id + function_call_output` continuation pattern.
- Uploaded file enrichment should use local parsers first. Use AIBERM models only after text extraction, for Prompt Draft and website generation, not for trusted R2 file-byte ingestion.

## 16. Website Prompt Control Refactor

### 16.1 Problem

The earlier Prompt Draft integration added too much normalization between the confirmed draft and website generation. The decision layer produced hardcoded `pageKind`, section skeletons, and component mix targets. Prompt Draft enrichment then embedded those module plans back into the final prompt, and the executor treated them as stronger constraints than the user's source material.

This created several failures:

- A personal blog could be interpreted through product or industrial modules.
- Uploaded PDF/source content could be diluted by preset page skeletons.
- Unsupported routes or generic pages could be masked by local fallback generation.
- Adding a new website type encouraged more hardcoded categories, which does not scale.

### 16.2 Target Architecture

Prompt Draft is the source of truth. The runtime contract is intentionally thin and deterministic.

The contract extractor may decide only:

- fixed routes
- navigation labels and order
- required output files
- page intent in natural language
- route source and evidence
- global constraints such as Prompt Draft adherence and route isolation

The contract extractor must not decide:

- website vertical/category by hardcoded taxonomy
- page skeletons such as `product-grid`, `quote-form`, or `case-gallery`
- component mix percentages
- industry-specific module names
- fallback content

The executor uses the contract to split work and validate file completeness. It relies on the confirmed Prompt Draft and source content to design each page.

### 16.3 Runtime Rules

1. Generate only routes and files declared by the `Prompt Control Manifest`.
2. Keep `/` first, `/contact` second-to-last, and `/about` last when those pages exist.
3. Each page must derive its sections, content depth, and interactions from the Prompt Draft and page intent.
4. No two inner pages may be repeated templates with swapped copy.
5. Missing required files, invalid HTML, missing `/styles.css`, or missing `/script.js` references are generation failures.
6. Do not repair provider failures with local website fallback content.
7. Style selection is advisory. It must not override Prompt Draft semantics or source material.

### 16.4 Implementation Status

Implemented:

- Replaced hardcoded decision-layer skeleton generation with thin page intent contracts.
- Added `pageIntents` to the local decision plan while keeping `pageBlueprints` as a compatibility alias.
- Prompt Draft enrichment now writes a thin `Prompt Control Manifest` instead of a module blueprint or page skeleton contract.
- Executor target-page prompts now reference Prompt Draft authority and route intent, not page kind or skeleton modules.
- Website workflow skill rules now require page intent adherence instead of page skeleton adherence.
- Regression tests now assert that no product/contact skeleton is injected by the decision layer.

Deferred:

- Remove legacy compatibility fields (`pageKind`, `contentSkeleton`, `componentMix`) after older executor paths are retired.
- Add replay-based regression fixtures for representative uploaded-document projects.

## 17. Canonical Website Prompt Refactor

### 17.1 Root Cause

The original Prompt Draft goal was correct: collect user information, enrich it with uploaded files/domain research/web search, and compile a complete prompt that can drive the website generation skill.

The regression came from over-normalizing that prompt into structured generation data. A rich PDF-style brief contains nuanced positioning, source facts, page copy direction, visual rules, and component intent. Moving this into a structured `generationSpec` loses information and encourages hardcoded page categories, fallback templates, and brittle decision-layer rules.

### 17.2 Target Architecture

Prompt Draft is now treated as a **Canonical Website Prompt**:

- It is a rich markdown generation brief.
- It keeps source facts, user constraints, assumptions, global design rules, page-by-page prompts, and special component requirements in prose.
- It is the source of truth for website semantics and page content.
- It should be similar in depth to the CASUX PDF prompt: overall positioning, detailed page prompts, general design specifications, and special component prompts.

Structured data is only a thin **Prompt Control Manifest**:

- routes
- navigation labels and order
- required output files
- natural-language page intents
- route source

The Prompt Control Manifest is used only to split generation work and validate file completeness. It must not contain page skeletons, component mixes, copy plans, industry modules, or fallback content.

### 17.3 Prompt Draft Workflow

1. Collect required slots through the UI.
2. Ingest uploaded files from Cloudflare R2 and parse text locally when possible.
3. If a domain exists, prioritize same-domain extraction and domain-focused search.
4. If information is still thin, use adaptive web search to fill market/context gaps.
5. Build a local canonical prompt template.
6. Ask the LLM to expand it into a complete Canonical Website Prompt in the user's display language.
7. Attach the Prompt Control Manifest to the prompt as a machine-readable route/file handoff.
8. Wait for user confirmation.
9. Pass the confirmed Canonical Website Prompt into the website generation skill as the main requirement.

### 17.4 Runtime Rules

- The confirmed Canonical Website Prompt outranks raw user text, inferred defaults, and design templates.
- The decision layer may infer only route/file/page-intent control data.
- The executor must not create product/SaaS/industrial/e-commerce semantics unless the Canonical Website Prompt or source material says so.
- If uploaded files define a site structure, that structure should drive route planning.
- If pages are missing or repeated, fail validation instead of repairing with generic fallback content.

### 17.5 Implementation Status

Implemented:

- Prompt Draft output now exposes only `canonicalPrompt` for the rich markdown prompt.
- Prompt Draft enrichment writes a `Prompt Control Manifest (Machine Readable)` JSON block for route/file handoff.
- The chat API stores `canonicalPrompt` and `promptControlManifest` in prompt draft metadata and workflow context.
- Chat storage no longer maps legacy fields. It keeps canonical fields and drops stale `promptDraft`, `requirementDraft`, and `generationRoutingContract` keys when records are read or written.
- Development databases can be cut over with `apps/web/supabase/cleanup_legacy_prompt_fields.sql`, which deletes legacy prompt JSON keys without migrating their values.
- Skill runtime requirement extraction prefers `canonicalPrompt` over aggregated/raw requirement fallbacks.
- Website generation workflow rules now describe the Canonical Website Prompt as the source of truth.
- Local prompt template no longer injects product/service/case/contact page skeleton assumptions as default page content.
- Added a replay regression for `chat-1777295743941-6q000n` to ensure the personal AI blog request produces `/` and `/blog` without product-route or module-blueprint leakage.

Deferred:

- Rename UI labels from “Prompt Draft” to a clearer product term after copy review.
- Remove the old field-name deletion guard after the development database is recreated or fully purged.
- Add replay fixtures that compare generated site content against uploaded source documents.

## 18. Canonical Prompt First Optimization

### 18.1 Decision

The prompt draft layer should not become a structured website generator. Its job is to help non-expert users produce a complete, PDF-style Canonical Website Prompt through a limited number of guided turns, uploaded-file ingestion, domain research, and web search. The website generation skill should then use that prompt directly.

The successful CASUX baseline proves the target behavior: when the full CASUX prompt is passed directly into the skill main flow, the model can produce a strong multi-page website because it sees the original page-by-page instructions, visual style, content modules, and interaction intent as one coherent brief.

The regression appeared after inserting too many transformation layers between that prompt and generation:

- the prompt was converted into thin route/page data;
- the decision layer generated generic page intents;
- page generation rounds received the route name but not the page's source-defined detailed brief;
- style selection and fallback logic sometimes became stronger than prompt semantics;
- repeated section/class patterns were then patched with additional prohibitions instead of fixing the information break.

### 18.2 Target Flow

The optimized flow is:

1. Gather user slots and files.
2. Build a Website Knowledge Profile from user input, uploaded documents, domain extraction, and web search.
3. Ask the LLM to write a rich Canonical Website Prompt in the user's display language.
4. Attach a thin Prompt Control Manifest for route/file handoff only.
5. On user confirmation, pass the full Canonical Website Prompt as the primary requirement.
6. For each generated page, extract the route-specific source brief from the Canonical Website Prompt and put it directly in that page's generation round.
7. Use shared style tokens, header, footer, and global JS/CSS, but let each page body follow its own source brief.

### 18.3 Responsibility Boundaries

Prompt Draft / Canonical Prompt:

- owns website positioning, audience, tone, visual direction, page-by-page copy direction, modules, and interaction intent;
- should preserve detailed source material instead of compressing it into a generation spec;
- may include explicit assumptions and content gaps when the source is incomplete.

Prompt Control Manifest:

- owns routes, navigation labels, output files, and natural-language page intents;
- must remain machine-readable and small;
- must not own page skeletons, industry modules, component mixes, copy plans, or template categories.

Decision layer:

- validates and normalizes route/file handoff;
- preserves prompt-provided route order and navigation;
- extracts route-specific source briefs when possible;
- must not decide website verticals, page kinds, or hardcoded skeletons.

Executor:

- splits generation into bounded file/page rounds;
- injects the full Canonical Website Prompt and the current page's source brief;
- validates required files, shared assets, navigation, and page differentiation;
- must not repair weak prompts by inserting generic local website content.

Design selection:

- may use template libraries as visual references;
- must obey explicit prompt style, color, audience, and mood first;
- should fall back to prompt-adaptive design when the prompt gives clear visual requirements.

### 18.4 Page Differentiation Root Fix

Do not solve repeated pages by adding more vertical-specific rules. The root fix is to keep the page-level source brief connected to each page generation round.

For every target route:

- locate the matching page section in the Canonical Website Prompt using route, nav label, heading, page/channel markers, and generation verbs;
- tolerate PDF extraction variants such as `页面`, `頁面`, `⻚⾯`, and channel-style headings;
- pass the extracted source brief as authoritative context for that HTML file;
- allow shared shell and design tokens, but require the main body structure to come from the page's own brief.

If the extractor cannot find a page brief, the executor should still pass the complete Canonical Website Prompt and explicitly tell the model to derive a unique page architecture from it. It should not synthesize an industry skeleton.

### 18.5 Implementation Status

Implemented:

- Added route-specific source brief extraction in the decision layer.
- Injected the extracted page brief into skill-tool page rounds.
- Injected the extracted page brief into the direct page generation path.
- Kept `pageKind`, `contentSkeleton`, and `componentMix` as compatibility fields only; they remain empty and should not drive generation.
- Added regression coverage for extracting a page-specific source brief from uploaded prompt material.
- Verified the CASUX replay context now preserves the 34K Canonical Website Prompt and page-specific snippets are available to page generation.

Next improvements:

- Improve uploaded-document parsing so page briefs are captured before the LLM draft step, reducing reliance on later free-text extraction.
- Add a golden replay fixture for CASUX that compares section variety and page content against the source document, not only route/file success.
- Remove compatibility fields after all runtime paths consume only route/file/page-brief contracts.

---

## 19. Web Analytics Capacity Policy Update (2026-04-29)

Cloudflare Web Analytics has a hard product distinction:

- Not proxied through Cloudflare: 10 sites.
- Proxied through Cloudflare: no site count limit.

Reference: https://developers.cloudflare.com/web-analytics/limits/

### 19.1 Decision

Shpitto must not create a Cloudflare Web Analytics site for every temporary `*.pages.dev` deployment.

The deployment contract is:

1. Cloudflare Pages deployment must succeed even when Web Analytics capacity is exhausted.
2. `*.pages.dev` preview deployments skip Web Analytics by default.
3. Web Analytics provisioning is allowed only when:
   - the deployment host is not `*.pages.dev`, usually a custom domain, or
   - the operator explicitly sets `CLOUDFLARE_WA_ENABLE_PAGES_DEV=1`.
4. If Web Analytics is skipped or unavailable, record a non-blocking `analyticsStatus` and warning.
5. The Analysis page must not auto-create Web Analytics sites for `*.pages.dev`; otherwise simply opening the page can consume the 10-site quota again.

### 19.2 Runtime Environment

```env
# Default: 1. Set 0 to disable all automatic Web Analytics provisioning.
CLOUDFLARE_WA_AUTO_PROVISION=1

# Default: unset/0. Keep pages.dev preview deployments from consuming not-proxied quota.
CLOUDFLARE_WA_ENABLE_PAGES_DEV=0
```

### 19.3 Operational Cleanup

Use `docs/cloudflare-wa-capacity-ops.md` to clear old not-proxied Web Analytics sites.
Cleanup should be scoped by explicit host patterns and run as dry-run first.

Recommended sequence:

1. Deploy code that skips `*.pages.dev` Web Analytics.
2. Dry-run cleanup for known generated preview host patterns.
3. Apply cleanup only to confirmed disposable hosts.
4. Keep custom-domain analytics enabled for production sites.
