# 网站生成完整技术方案（当前实现）

## 1. 目标与范围

本文档定义 `shpitto` 当前网站生成功能的完整技术方案，覆盖：

- 入口协议（API）
- 异步任务系统（Supabase + Worker）
- Skill Native Runtime 执行链路
- LLM Provider 锁定与超时机制
- 中间产物落盘与对象存储（R2）
- 部署触发（Cloudflare）
- 监控、回归测试与故障处理

本文档是“当前落地实现”的说明，不是抽象理想方案。

---

## 2. 总体架构

### 2.1 架构分层

1. API 层（Next.js Route）
- 职责：接收用户请求、创建任务、返回 `taskId`、查询任务状态。
- 代码：`apps/web/app/api/chat/route.ts`、`apps/web/app/api/chat/tasks/[taskId]/route.ts`

2. 任务存储层（Supabase）
- 职责：任务状态机、任务事件日志、任务 claim（`FOR UPDATE SKIP LOCKED`）。
- 代码：`apps/web/lib/agent/chat-task-store.ts`
- SQL：`apps/web/supabase/chat_tasks.sql`、`apps/web/supabase/chat_task_events.sql`、`apps/web/supabase/chat_task_claim.sql`

3. 执行层（Worker + Skill Runtime）
- 职责：按固定阶段调用 LLM 生成文件并实时落盘。
- Worker：`apps/web/scripts/chat-task-worker.mts`
- Runtime：`apps/web/lib/skill-runtime/executor.ts`
- 生产建议：普通生成/精修 worker 与部署 worker 分离运行，避免长时间 Cloudflare 部署阻塞生成队列。

4. 产物层（本地 checkpoint + R2）
- 职责：保存中间步骤产物与最终站点文件，支持进度可视化和排障。
- 代码：`apps/web/lib/skill-runtime/executor.ts`（`persistStepArtifacts`）

5. 编排与部署层（Graph）
- 职责：对话意图/部署入口编排（生成主路径已迁移到 runtime）。
- 代码：`apps/web/lib/agent/graph.ts`

6. 生产部署执行层（Deployer）
- 职责：只消费 `executionMode = deploy` 的异步任务，执行 Cloudflare Pages 生产部署、D1 Blog runtime 绑定与线上 smoke。
- 推荐运行位置：Railway 常驻部署域 Worker service；当前阶段可以和现有 Cloudflare 部署 worker 合并在同一个 service/container 中。
- 推荐部署工具：`wrangler pages deploy`，用于确保 `_worker.js` 与 Pages Functions 真正生效。
- Vercel 只负责 Web/API、任务入队和状态查询，不在请求链路中直接运行 `wrangler`。

### 2.2 关键设计原则

- 生成主链路异步化：API 不做长耗时生成。
- 文件级产物化：每阶段完成即可看到产物。
- run 级 provider 锁定：单次任务内部不跨 provider 抖动。
- 流式 idle timeout：以“最后 token 到达时间”刷新超时计时。
- Skill 来源固定：仅从 `apps/web/skills` 读取并校验 `skill_id`。

---

## 3. 端到端流程

### 3.1 请求接入

1. `POST /api/chat` 接收用户 prompt。
2. 解析用户最后一条文本，构造 `inputState`。
3. 调用 `createChatTask` 入队，返回 `202 + taskId`。

实现点：
- 同步路径禁用（仅异步任务模式）。
- 若同 chat 已有 `queued/running` 任务，返回现有任务状态。

### 3.2 Worker 执行

1. Worker 轮询并 `claimNextQueuedChatTask`。
2. 进入 `worker:claimed` 状态并写 heartbeat。
3. 调用 `SkillRuntimeExecutor.runTask` 执行生成。
4. 成功后 `completeChatTask`；失败则 `failChatTask`。

### 3.3 Runtime 固定阶段

固定阶段定义：

- `task_plan`
- `findings`
- `design`
- `styles`
- `script`
- `index`
- `pages`
- `repair`

阶段常量：`apps/web/lib/skill-runtime/stages/types.ts`

### 3.4 阶段产物

- 工作流文档：`/task_plan.md`、`/findings.md`、`/DESIGN.md`
- 静态资源：`/styles.css`、`/script.js`
- 页面文件：`/index.html` + `/<route>/index.html`

`repair` 阶段执行 HTML 修复/规范化并重新写回。

---

## 4. Skill Native Runtime 设计

### 4.1 决策层（本地结构化决策）

`buildLocalDecisionPlan` 在本地生成：

- 路由列表（默认 6 页）
- 页面职责（responsibility）
- 页面骨架（contentSkeleton）
- 组件配比（componentMix）
- 语言偏好（`zh-CN` / `en`）

代码：`apps/web/lib/skill-runtime/decision-layer.ts`

### 4.2 LLM 调用层

- 使用 `ChatOpenAI` 对接 `aiberm/crazyroute`（OpenAI 兼容接口）。
- `invokeModelWithIdleTimeout` 优先使用流式；每个 chunk 刷新 idle timer。
- 非流式时采用绝对超时兜底。

代码：`apps/web/lib/skill-runtime/llm-stream.ts`

### 4.3 Provider 锁定策略

- `resolveRunProviderLock` 在 run 开始时选择 provider+model。
- 优先顺序由 `LLM_PROVIDER_ORDER`（默认 `aiberm,crazyroute`）。
- 同一 run 内固定，不做 provider 级来回切换。

代码：`apps/web/lib/skill-runtime/provider-lock.ts`

### 4.4 页面与资源生成策略

- 先生成共享资源：`styles.css`、`script.js`
- 再生成 `index.html` 和其余页面
- `ensureHtmlDocument` 校验并补齐关键结构

代码：`apps/web/lib/skill-runtime/executor.ts`

### 4.5 Skill 按需动态加载（避免上下文膨胀）

- Skill 仍只从 `apps/web/skills` 加载，不读取 `.codex/skills`。
- 主入口 skill 固定：`website-generation-workflow`（必选）。
- 辅助 skill 使用阶段化动态注入，不再整包一次性拼接到每次 prompt：
  - `styles`：`responsive-by-default`、`web-image-generator`、`web-icon-library`
  - `script`：`responsive-by-default`
  - `page`：`section-quality-checklist`、`web-image-generator`、`web-icon-library`、`responsive-by-default`
  - `repair`：`end-to-end-validation`、`verification-before-completion`、`visual-qa-mandatory`
- 支持别名映射：
  - `brainstorming` -> `superpowers-brainstorming`
  - `writing-plans` -> `superpowers-writing-plans`
- 每阶段注入内容有总长度上限（`SKILL_DYNAMIC_DIRECTIVE_MAX_CHARS`），默认裁剪，避免 prompt 过大导致延迟或超时。

---

## 5. 状态与数据模型

### 5.1 任务主表 `shpitto_chat_tasks`

核心字段：
- `id`, `chat_id`, `status`
- `result`（jsonb，含 assistantText/actions/progress/internal）
- `retry_count`, `last_error_code`
- `created_at`, `updated_at`, `expires_at`

SQL：`apps/web/supabase/chat_tasks.sql`

### 5.2 任务事件表 `shpitto_chat_task_events`

用于阶段事件与进度回放：
- `task_id`, `chat_id`
- `event_type`, `stage`, `payload`
- `created_at`

SQL：`apps/web/supabase/chat_task_events.sql`

### 5.3 任务 claim 函数

`shpitto_claim_next_chat_task(worker_id)`：
- `queued` 任务按创建时间升序 claim
- `FOR UPDATE SKIP LOCKED` 防并发重复消费

SQL：`apps/web/supabase/chat_task_claim.sql`

### 5.4 Progress 字段（result.progress）

已使用字段包括：
- `stage`, `filePath`
- `provider`, `model`, `attempt`
- `startedAt`, `lastTokenAt`, `elapsedMs`
- `artifactKey`, `errorCode`
- `pageCount`, `fileCount`, `generatedFiles`
- `checkpointSaved`, `checkpointDir`, `checkpointStatePath`, `checkpointProjectPath`

---

## 6. 产物持久化方案

### 6.1 本地 checkpoint

路径：
- `.tmp/chat-tasks/<chatId>/<taskId>/...`

保存内容：
- 每阶段快照
- `state.json`
- `project.json`

### 6.2 R2 对象存储

按 step 分层上传：
- `.../steps/<step>/manifest.json`
- `.../steps/<step>/site/*`
- `.../steps/<step>/workflow/*`
- `.../steps/<step>/pages/*`

作用：
- 在线进度可见
- 故障后复盘
- 回归比对与审计

---

## 7. API 协议

### 7.1 `POST /api/chat`

行为：
- 创建异步任务并返回 `taskId`
- 状态码 `202`
- 支持 `skill_id` 参数（默认 `website-generation-workflow`）

返回要点：
- `taskId`
- `statusPath`（`/api/chat/tasks/{taskId}`）

### 7.2 `GET /api/chat/tasks/{taskId}`

返回：
- 任务主状态（queued/running/succeeded/failed）
- `result`（面向前端的脱敏结果）
- `events`（阶段事件列表）

---

## 8. 配置项（环境变量）

### 8.1 任务/Worker

- `CHAT_ASYNC_DEFAULT`
- `CHAT_ASYNC_MAX_ROUNDS_SKILL_NATIVE`
- `CHAT_ASYNC_TASK_TIMEOUT_MS`
- `CHAT_WORKER_POLL_MS`
- `CHAT_WORKER_STALE_RUNNING_MS`
- `CHAT_WORKER_ONCE`
- `CHAT_WORKER_CLAIM_MODES`：普通 worker 建议设置为 `generate,refine`
- `DEPLOY_WORKER_CLAIM_MODES`：部署 worker 建议设置为 `deploy`

### 8.2 Provider 与模型

- `SKILL_NATIVE_PROVIDER_LOCK`
- `SKILL_NATIVE_MODEL_LOCK`
- `LLM_PROVIDER_ORDER`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_MODEL_AIBERM`
- `LLM_MODEL_CRAZYROUTE`

### 8.3 API Key / Base URL

- `AIBERM_API_KEY`
- `AIBERM_BASE_URL`
- `CRAZYROUTE_API_KEY`（兼容 `CRAZYROUTER_API_KEY` / `CRAZYREOUTE_API_KEY`）
- `CRAZYROUTE_BASE_URL`（兼容别名）

### 8.4 超时与 token

- `LLM_REQUEST_TIMEOUT_SKILL_DIRECT_SHARED_ASSET_MS`
- `LLM_REQUEST_TIMEOUT_SKILL_DIRECT_ROOT_MS`
- `LLM_REQUEST_TIMEOUT_SKILL_DIRECT_PAGE_MS`
- `LLM_MAX_TOKENS_SKILL_DIRECT_SHARED_ASSET`
- `LLM_MAX_TOKENS_SKILL_DIRECT_PAGE`
- `LLM_MAX_RETRIES`

---

## 9. 失败语义与恢复策略

### 9.1 失败分类

`classifyErrorCode` 当前分类：
- `timeout`
- `rate_limit`
- `auth`
- `network`
- `html_invalid`
- `unknown`

### 9.2 当前恢复策略

- 任务失败写入 `result.progress` + event 日志。
- Worker 支持 stale-running requeue。
- 阶段失败即任务失败（fail-fast）。

### 9.3 可观测性

- 通过 task events 复原每个阶段执行轨迹。
- 通过 checkpoint + R2 复盘“生成了什么、失败在何处”。

---

## 10. 与 Graph 的关系

- `graph.ts` 仍作为对话编排与部署相关逻辑入口。
- 生成主链路已迁移到 `SkillRuntimeExecutor`。
- `async-mainflow-runner` 已退役（保留提示，防止误用）。

---

## 11. 回归测试矩阵

现有重点测试：

- `apps/web/lib/agent/skill-runtime-e2e.test.ts`
- `apps/web/lib/agent/chat-task-worker-run.test.ts`
- `apps/web/lib/skill-runtime/decision-layer.test.ts`
- `apps/web/lib/agent/lc-cnc-online-regression.test.ts`

建议最小回归门禁：
- 6 页面产物齐全
- `styles.css` / `script.js` 引用正确
- 导航互链正确
- 任务状态与事件流完整

---

## 12. 当前已知差距（相对 opencode 原生体验）

1. 仍存在 HTML 修复/补齐逻辑（不是纯工具补丁式落盘）。
2. 页面生成 prompt 对资源引用有显式约束。 
3. 仍有本地 fallback 渲染（用于兜底稳定性）。

这些差距不会影响主链路可用性，但会影响“完全等价 opencode 执行语义”。

---

## 13. 后续演进建议（可执行）

1. 把 HTML 修复从“重写结构”收敛为“最小校验 + 当轮修正”。
2. 将 fallback 页面渲染切到显式 debug 开关，默认关闭。
3. 增加每阶段首包耗时与 token 指标，形成稳定性看板。
4. 将部署前校验（资源引用、导航可达、HTML 完整）做成独立 `verify` 阶段。
5. 将 Cloudflare 动态 Blog runtime 的生产部署从 Direct Upload 切换为独立 deployer + Wrangler。

---

## 14. 一页结论

当前网站生成系统已形成“异步任务 + skill runtime + 文件级产物 + 可观测”的完整闭环，核心链路可运行、可排障、可回归。接下来若目标是“完全对齐 opencode 执行语义”，应继续削减修复/兜底层，把主路径进一步收敛到“按文件直接生成 + 当轮修正 + 失败即报错”。

---

## 15. Blog 后台与默认内容页方案

### 15.1 目标

Blog 被定义为 `shpitto` 的默认站点能力之一，满足以下目标：

- 在 `shpitto -> data -> blog` 中完成内容编辑
- 博客内容按 `project` 维度隔离
- 内容真源存储在 Cloudflare D1
- 图片 / 附件等资源存储在 Cloudflare R2
- Supabase 只负责登录账号与 `project -> website` 归属关系
- 公开 blog 页面支持服务端渲染，满足 SEO、canonical、sitemap、OG/Twitter Card

### 15.2 职责边界

1. Supabase
- 负责登录态、用户身份、`account -> project -> website` 关系
- 不承载 blog 正文、草稿、版本、媒体文件

2. D1
- 负责 blog 的结构化正文数据与元数据
- 负责文章状态、slug、标签、分类、SEO 字段、发布时间、草稿版本
- 作为 canonical source

3. R2
- 负责图片、封面、附件等二进制资源
- 文章正文只存资源引用，不直接把图片二进制塞进正文表

4. KV
- 只允许作为可选的发布态缓存或快照副本
- 不作为唯一真源

### 15.3 数据模型

建议在 D1 中新增以下表：

- `shpitto_blog_posts`
- `shpitto_blog_post_revisions`
- `shpitto_blog_assets`
- `shpitto_blog_settings`

核心字段建议：

- `slug`
- `title`
- `excerpt`
- `content_md`
- `content_html`
- `status`（`draft | scheduled | published | archived`）
- `category`
- `tags_json`
- `cover_image_url`
- `seo_title`
- `seo_description`
- `theme_key`
- `layout_key`
- `published_at`
- `created_at`
- `updated_at`

### 15.4 编辑端工作流

用户路径固定为：

`shpitto -> data -> blog`

编辑体验建议：

- 列表区：文章搜索、状态、发布时间、最后更新
- 编辑区：标题、slug、摘要、正文、分类、标签、封面、SEO 字段
- 正文区：Milkdown 富文本 Markdown 编辑器
- 预览区：Markdown 渲染结果
- 操作：新建、保存、发布、归档、删除

当前实现中，编辑器壳落在 `data` 页面内，正文编辑区已接入 Milkdown Crepe。Milkdown 只作为编辑体验层，`content_md` 仍然是内容真源。

### 15.5 公开页面与 SEO

公开 blog 页必须由服务端输出内容，不能依赖纯客户端渲染。

SEO 最低要求：

- `/blog` 与 `/blog/[slug]` 服务端输出正文
- 每篇文章有 `generateMetadata`
- 支持 canonical
- 生成 `sitemap.xml`
- 生成 `robots.txt`
- 图片有稳定 URL 与 `alt`
- 文章详情页首屏正文可被爬虫直接抓取

### 15.6 Cloudflare Pages 约束

由于站点部署在 Cloudflare Pages：

- 生成阶段只产出静态页面视觉稿，Blog 页面使用 mock posts 展示排版、卡片、详情页结构和导航，不在生成代码中写入数据库连接、D1 binding 名称或真实文章数据。
- 部署阶段由 Shpitto 受控代码从 D1 读取数据并注入 Blog snapshot，而不是让 LLM 生成数据访问代码。
- 当前自研 Cloudflare Pages Direct Upload API 可以上传静态文件和 `_worker.js` 文件，但 live smoke 已证明该路径不会可靠启用 Pages Functions；因此 Direct Upload 只能作为静态 snapshot 部署路径，不允许作为动态 D1 Blog runtime 的生产路径。
- 动态 D1 Blog runtime 必须通过 Wrangler/Git/Workers 等能够真正发布 Pages Functions 的部署方式启用。当前推荐方案是独立 deployer 调用 `wrangler pages deploy`。
- D1 与 R2 作为运行时数据层
- KV 只做可选缓存，不做写后唯一读源
- Cloudflare Pages 项目创建/更新时，只有启用动态 runtime 时才需要通过 `deployment_configs.*.d1_databases` 绑定 D1。绑定名由 `SHPITTO_DEPLOY_BLOG_D1_BINDING` 控制，默认 `DB`。

部署到 Cloudflare Pages 的生成站点采用以下混合方案：

1. 生成期
- `/blog` 页面是站点原生 Blog 数据源页面，必须保留同一语言、导航、视觉系统、CTA 策略和 `data-shpitto-blog-root` / `data-shpitto-blog-list` / `data-shpitto-blog-api="/api/blog/posts"` 挂载点。
- 文章详情视觉不由 Worker 硬编码。部署阶段会从生成站点派生 `/shpitto-blog-post-shell.html`，因此生成期必须为 Blog 详情保留可复用的文章详情排版风格。
- page prompt 明确要求：Blog route 只能生成 mock cards，不生成 D1、SQL、API token 或真实数据访问逻辑。

2. 部署打包期
- `SkillRuntimeExecutor` 在 `Bundler.createBundle` 前调用 `buildDeployedBlogSnapshotFilesFromD1` 和 `injectDeployedBlogSnapshot`。
- 部署包新增 `/blog/{slug}/index.html`、`/blog/rss.xml`、`/shpitto-blog-snapshot.json`、`/shpitto-blog-post-shell.html` 和 `/shpitto-blog-theme.json`。
- `/shpitto-blog-post-shell.html` 从生成的 `/blog/index.html` 或 `/index.html` 派生，保留 `<html lang>`、head 资源、header、footer、CSS、字体和站点 CTA，只将文章区域替换为 `__SHPITTO_BLOG_POST_*__` 占位符。
- snapshot 使用当前 `project_id` 从 D1 只读查询 `status = published` 的文章。
- 如显式设置 `SHPITTO_DEPLOY_BLOG_RUNTIME=1`，部署包额外注入 `/_worker.js`、`/_routes.json` 与 `/shpitto-blog-runtime.json`。
- 只要注入动态 runtime，生产部署策略必须切到 `wrangler`，不能继续使用 Direct Upload。

3. 运行期
- 默认情况下 `/blog` 保持生成站点原生页面，文章列表通过静态 fallback 或 `/api/blog/posts` hydration 展示。
- 默认情况下 `/blog/{slug}` 可以由部署期静态 snapshot 输出。
- 启用 runtime 后，`GET /api/blog/posts`、`GET /api/blog/posts/{slug}` 和 `GET /blog/{slug}/` 由 `_worker.js` 从 D1 动态输出；其中 `/blog/{slug}/` 必须读取 `/shpitto-blog-post-shell.html` 并注入文章内容，禁止回退到通用 runtime 模板，除非 shell 不存在。
- Blog settings 中的 `enabled`、`rss_enabled` 控制公开输出。

该方案优先级高于“生成阶段直接绑定 D1”。原因是生成模型不应接触数据库权限，部署环境才知道 Pages 项目、D1 database id、binding 名称、域名与缓存策略。

### 15.7 生产部署架构：Vercel + Railway 部署域 Service + Wrangler

生产部署采用“Vercel 入队，Railway 部署域 service 执行，Cloudflare 承载”的拆分架构：

```text
用户点击部署 / 聊天中请求部署
  -> Vercel /api/chat
  -> 写入 shpitto_chat_tasks，workflow_context.executionMode = deploy
  -> 立即返回 202 + taskId

Railway deployment-domain service
  -> 只 claim executionMode = deploy 的任务
  -> 读取 checkpoint / R2 生成产物
  -> 注入 Blog snapshot 与 Blog D1 runtime
  -> 调用 wrangler pages deploy
  -> 执行线上 smoke
  -> 写回 task succeeded/failed、deployedUrl 和部署元数据

Cloudflare Pages
  -> 每个生成站点一个 Pages project
  -> 每个站点部署同一份 Blog runtime 模板
  -> 共用一个 D1 Blog 数据库，通过 project_id 隔离数据
```

职责边界：

- Vercel：负责 Web UI、`/api/chat` 入队、鉴权、套餐校验、额度预占、任务状态查询和后台 Blog CMS API。
- Supabase：负责 `shpitto_chat_tasks`、任务事件、聊天 timeline、账号、项目关系和计费相关权威数据。
- Railway 部署域 service：负责长耗时部署任务、Wrangler CLI、Cloudflare 凭据、部署重试、部署日志和 smoke gate。
- Cloudflare Pages：负责承载生成站点、Pages Functions、D1 binding、R2 公开资源和线上访问。

不建议在 Vercel Function 请求链路内直接运行 `wrangler`。原因：

- 部署耗时不可控，容易超过 Function 时限或阻塞用户请求。
- Wrangler 需要临时文件系统、CLI 依赖、Cloudflare token、重试和日志归档。
- 部署失败需要可恢复任务语义，而不是一次 HTTP 请求失败。
- 部署并发增长后，应优先横向扩部署域 worker，而不是扩 Web API。

如果短期必须 Vercel-only，可以做成后台异步函数，但只能作为过渡方案，并且必须写入任务状态、幂等锁和 smoke 结果；生产主路径仍以 Railway 部署域 service 为准。

### 15.7.1 部署域合并 service 决策

当前阶段允许把 Shpitto deploy worker 合并到现有 Cloudflare 部署 worker 所在的 Railway service/container。该判断成立的前提是：合并的是“部署域内的 worker”，而不是把生成 worker、Web API 与部署 worker 混在同一个运行域。

合并合理性：

- 部署本身是串行事务链：准备产物 -> 发布资源 -> 注入 Blog runtime -> Wrangler deploy -> smoke -> 写回状态。
- 任一部署环节失败都应使整个 deploy task 失败，合并在一个部署域 service 内更容易保证日志连续性和状态一致性。
- 早期并发不高时，拆分过细会增加队列、状态同步、重试和排障成本。
- 后续并发上来后，可以再按 asset publisher、Pages deployer、binding/domain worker、smoke verifier 拆分。

合并边界：

- 可以合并：Cloudflare Pages 部署、D1/R2 绑定、Blog runtime 注入、Wrangler deploy、线上 smoke。
- 不应合并：LLM 生成/精修 worker、Next.js Web/API、计费 webhook。
- 共享状态必须写 Supabase / D1 / R2，不能依赖容器内存或本地文件作为唯一状态。
- 部署 worker 初期并发按 1 处理；同一 Pages project 的部署必须串行。

当前仓库支持通过 `railway:start` 在同一个 repo 内选择运行角色：

```text
RAILWAY_WORKER_MODE=chat             -> 普通生成/精修 worker，默认 claim generate,refine
RAILWAY_WORKER_MODE=deploy           -> 部署域 worker，默认 claim deploy，启用 Wrangler + Blog runtime
RAILWAY_WORKER_MODE=deploy-preflight -> 只运行部署域 preflight 后退出
```

根目录 `railway.json` 使用统一入口：

```text
pnpm --filter web railway:start
```

如果当前 Railway 容器已经由外部 supervisor 管理 3 个 repo，可以只把 Shpitto 的启动命令加入该 supervisor：

```text
RAILWAY_WORKER_MODE=deploy pnpm --filter web railway:start
```

该方式不要求新建独立 Railway service；等部署并发、隔离和审计需求上来后，再拆出独立 `shpitto-deployer` service。

### 15.8 部署任务分流与 Worker Claim

当前 `shpitto_chat_tasks` 已能承载生成、精修和部署任务。生产环境需要增加 claim 过滤，避免普通生成 worker 与部署 worker 抢同一队列：

- 普通 worker：只处理 `generate`、`refine`。
- 部署 worker：只处理 `deploy`。
- 过滤字段：`result.internal.inputState.workflow_context.executionMode`。
- 兼容字段：`result.internal.inputState.workflow_context.deployRequested = true` 可作为 deploy 任务兜底识别。

建议环境变量：

```env
CHAT_WORKER_CLAIM_MODES=generate,refine
DEPLOY_WORKER_CLAIM_MODES=deploy
```

建议新增脚本：

```text
apps/web/scripts/deploy-task-worker.mts
```

该脚本可以复用 `chat-task-worker.mts` 的 retry、heartbeat、stale-running requeue 和 consistency sweep 能力，但 claim 时必须限制为 deploy mode。

Railway 部署域 service 建议：

```text
Service name: existing-cloudflare-deployment-service 或 shpitto-deployer
Start command: pnpm --filter web railway:start
Restart policy: always
Public HTTP: not required
```

部署域 service 环境变量：

```env
RAILWAY_WORKER_MODE=deploy
DEPLOY_WORKER_CLAIM_MODES=deploy
CLOUDFLARE_DEPLOY_STRATEGY=wrangler
SHPITTO_DEPLOY_BLOG_RUNTIME=1
RAILWAY_DEPLOY_PREFLIGHT=1
```

普通生成 worker service 环境变量：

```env
RAILWAY_WORKER_MODE=chat
CHAT_WORKER_CLAIM_MODES=generate,refine
```

### 15.9 Wrangler 部署适配器

动态 Blog runtime 的部署不应继续放在 `CloudflareClient.uploadDeployment()` 的 Direct Upload 实现里。建议新增：

```text
apps/web/lib/cloudflare-pages-wrangler.ts
```

职责：

```text
deployWithWrangler({
  taskId,
  projectName,
  bundle,
  branch: "main",
  d1Binding,
  env,
})
```

执行步骤：

1. 将 `Bundler.createBundle()` 产物物化到 `.tmp/deployments/{taskId}`。
2. 确保存在 `index.html`、静态资源、`_worker.js`、`_routes.json` 和 Blog runtime metadata。
3. 先调用 Cloudflare API 创建/更新 Pages project，并写入 D1 binding。
4. 调用 `wrangler pages deploy <dir> --project-name <projectName> --branch main --commit-dirty=true`。
5. 解析 Wrangler 输出中的 deployment URL。
6. 使用稳定生产别名 `https://{projectName}.pages.dev` 作为最终 `deployedUrl`。
7. 执行线上 smoke，通过后写回任务成功。

`SkillRuntimeExecutor.runDeployOnlyTask` 的部署策略：

```text
if SHPITTO_DEPLOY_BLOG_RUNTIME=1:
  strategy = "wrangler"
else:
  strategy = CLOUDFLARE_DEPLOY_STRATEGY || "direct-upload"
```

生产建议直接使用：

```env
CLOUDFLARE_DEPLOY_STRATEGY=wrangler
SHPITTO_DEPLOY_BLOG_RUNTIME=1
```

### 15.10 Blog SEO Runtime 形态

Blog 的目标是 SEO 友好，因此公开输出必须服务端可抓取：

- `/blog` 输出完整 HTML 列表页。
- `/blog/{slug}` 输出完整 HTML 详情页。
- `/blog/category/{category}` 与 `/blog/tag/{tag}` 输出完整 HTML 聚合页。
- `/blog/rss.xml` 输出 RSS XML。
- `/sitemap.xml` 包含 Blog 公开 URL。
- 详情页包含 canonical、Open Graph、Twitter Card、JSON-LD Article。

站点 runtime 采用“每站点 Pages Functions + 共享 runtime 模板”的方式：

- 物理上：每个 Cloudflare Pages 站点都有自己的 `_worker.js`。
- 逻辑上：所有站点使用同一份 Shpitto Blog runtime 模板。
- 数据上：所有站点共用同一个 D1 Blog 数据库，通过内置 `project_id` 隔离。

暂不采用一个全局 shared Worker 代理所有 Blog 请求。原因：

- 生成站点的 SEO URL、canonical、sitemap 和 RSS 应归属于站点自己的域名。
- Pages Functions 与当前每站点 Pages project 模型一致。
- 每个站点可独立回滚 runtime 版本。
- 后续站点数量大幅增长后，再评估 shared Worker + R2 asset origin 的集中化架构。

### 15.11 当前落地点

本仓库中的实际落点如下：

- `apps/web/components/chat/ProjectDataWorkspace.tsx`
- `apps/web/components/chat/ProjectBlogWorkspace.tsx`
- `apps/web/components/chat/BlogMilkdownEditor.tsx`
- `apps/web/app/api/projects/[projectId]/blog/route.ts`
- `apps/web/app/api/projects/[projectId]/blog/[postId]/route.ts`
- `apps/web/app/api/projects/[projectId]/blog/[postId]/assets/route.ts`
- `apps/web/app/api/projects/[projectId]/blog/settings/route.ts`
- `apps/web/app/api/blog/scheduled-publish/route.ts`
- `apps/web/lib/deployed-blog-snapshot.ts`
- `apps/web/lib/deployed-blog-snapshot.test.ts`
- `apps/web/lib/deployed-blog-runtime.ts`（显式 runtime 开关）
- `apps/web/lib/deployed-blog-runtime.test.ts`
- `apps/web/lib/cloudflare-pages-wrangler.ts`
- `apps/web/lib/cloudflare-pages-wrangler.test.ts`
- `apps/web/lib/blog.ts`
- `apps/web/lib/d1.ts`
- `apps/web/scripts/railway-start.mts`
- `apps/web/scripts/deploy-task-worker.mts`
- `apps/web/scripts/deploy-worker-preflight.mts`
- `apps/web/scripts/blog-runtime-wrangler-smoke.mts`
- `apps/web/app/blog/page.tsx`
- `apps/web/app/blog/[slug]/page.tsx`
- `apps/web/app/blog/rss.xml/route.ts`
- `apps/web/app/blog/category/[category]/page.tsx`
- `apps/web/app/blog/tag/[tag]/page.tsx`

公开 `/blog` 页面在当前仓库里可以通过 `SHPITTO_PUBLIC_BLOG_PROJECT_ID` 绑定一个项目作为 shpitto.com 主站展示源。生成站点部署到 Cloudflare Pages 时，通过部署包注入的静态 Blog snapshot 或 Wrangler 发布的动态 Blog runtime 绑定当前 generated website 对应的 `project_id`。

### 15.12 端到端落地链路

Blog 功能按以下链路实现，保证编辑端、存储层、公开页和 SEO 输出来自同一套数据：

1. 管理端入口
- `ProjectDataWorkspace` 新增 `blog` tab
- `ProjectBlogWorkspace` 负责文章列表、搜索、编辑、预览、保存、发布、删除
- 管理端只展示 D1 中真实 project blog 数据，不把公开 fallback demo 当作可编辑内容

2. API 层
- 所有写入请求先通过 `getAuthenticatedRouteUserId` 获取 Supabase 登录用户
- 再通过 D1 中 `shpitto_projects.owner_user_id` 校验 project 归属
- 校验通过后写入 `shpitto_blog_posts`，并追加 `shpitto_blog_post_revisions`
- D1 未配置时，写接口返回 `503`，避免用户误以为内容已保存

3. 存储层
- `content_md` 是文章正文真源
- `content_html` 是由 Markdown 渲染得到的服务端缓存字段
- `status = published` 的文章才进入公开列表、详情、sitemap
- `(project_id, slug)` 必须唯一，确保公开 URL 稳定

4. 公开站点
- `/blog` 使用 `getPublicBlogIndex`
- `/blog/[slug]` 使用 `getPublicBlogPost`
- 没有绑定 `SHPITTO_PUBLIC_BLOG_PROJECT_ID` 或开发环境 D1 不可用时，公开页可以展示 `BLOG_FALLBACK_POSTS` 作为默认内容
- 生产环境绑定 project 后，公开页以 D1 published 数据为准

5. 生成站点部署 runtime
- 生成过程保留 Blog mock 页面，确保用户在预览阶段能看到 Blog 的版式效果。
- Direct Upload 默认部署过程注入静态 Blog snapshot，用当前 `project_id` 从 D1 读取真实 published 数据并生成可被爬虫抓取的 HTML。
- 部署过程同时注入 `/shpitto-blog-snapshot.json`，用于审计当前站点是否已绑定 Blog snapshot，以及绑定的 `project_id`。
- 如果启用 `SHPITTO_DEPLOY_BLOG_RUNTIME=1`，额外注入 `/_worker.js` 和 `/_routes.json`，该 worker 拦截 `/blog*` 和 `/api/blog*`，用当前 `project_id` 从 D1 动态读取 published 数据。
- 动态 runtime 必须由 Wrangler/Git/Workers 部署链路发布；Direct Upload 只能作为静态 snapshot 兜底。

### 15.13 API 契约

| 路由 | 方法 | 用途 | 权限 | 主要返回 |
| --- | --- | --- | --- | --- |
| `/api/projects/{projectId}/blog` | `GET` | 获取当前项目 blog 列表与设置 | 登录 + project owner | `{ ok, posts, settings }` |
| `/api/projects/{projectId}/blog` | `POST` | 新建文章草稿或直接发布 | 登录 + project owner | `{ ok, post }` |
| `/api/projects/{projectId}/blog/{postId}` | `GET` | 获取单篇后台文章 | 登录 + project owner | `{ ok, post }` |
| `/api/projects/{projectId}/blog/{postId}` | `PATCH` | 更新文章内容、状态、SEO 字段 | 登录 + project owner | `{ ok, post }` |
| `/api/projects/{projectId}/blog/{postId}` | `DELETE` | 删除后台文章 | 登录 + project owner | `{ ok }` |
| `/api/projects/{projectId}/blog/settings` | `GET` | 获取 blog 设置 | 登录 + project owner | `{ ok, settings }` |
| `/api/projects/{projectId}/blog/settings` | `PATCH` | 更新 blog 设置 | 登录 + project owner | `{ ok, settings }` |
| `/api/projects/{projectId}/blog/{postId}/assets` | `GET` | 获取文章 R2 图片资源 | 登录 + project owner | `{ ok, assets }` |
| `/api/projects/{projectId}/blog/{postId}/assets` | `POST` | 上传文章 R2 图片资源 | 登录 + project owner | `{ ok, asset }` |
| `/api/projects/{projectId}/blog/{postId}/assets?assetId=...` | `DELETE` | 删除文章 R2 图片资源 | 登录 + project owner | `{ ok }` |
| `/api/blog/scheduled-publish` | `POST` | 发布到期 scheduled 文章 | `SHPITTO_CRON_SECRET` / `CRON_SECRET` | `{ ok, publishedCount }` |
| 部署站点 `/blog` | `GET` | 获取当前部署项目 Blog 列表页，保留生成站点主题并可由 API hydration 刷新 | 静态生成页 + 可选 runtime API | HTML |
| 部署站点 `/blog/{slug}` | `GET` | 获取当前部署项目 Blog 详情页；runtime 模式下读取 post shell 并动态注入 D1 文章 | 静态 snapshot 或 Pages D1 binding + 内置 project_id | HTML |
| 部署站点 `/api/blog/posts` | `GET` | 获取当前部署项目 published posts | 仅显式 runtime 模式：Pages D1 binding + 内置 project_id | `{ ok, posts, settings }` |
| 部署站点 `/api/blog/posts/{slug}` | `GET` | 获取当前部署项目单篇 published post | 仅显式 runtime 模式：Pages D1 binding + 内置 project_id | `{ ok, post, settings }` |

写入 payload 统一使用：

```json
{
  "input": {
    "title": "Article title",
    "slug": "article-title",
    "excerpt": "Short summary",
    "contentMd": "# Markdown body",
    "status": "draft",
    "authorName": "Author",
    "category": "Category",
    "tags": ["seo", "growth"],
    "coverImageUrl": "https://...",
    "coverImageAlt": "Cover alt",
    "seoTitle": "SEO title",
    "seoDescription": "SEO description",
    "themeKey": "editorial",
    "layoutKey": "feature",
    "publishedAt": null
  }
}
```

### 15.14 部署环境变量

Vercel Web 环境：

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SHPITTO_DEPLOY_QUEUE_ENABLED=true
SHPITTO_RUN_DEPLOY_IN_VERCEL=false
```

Railway 部署域 worker 环境：

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=

CLOUDFLARE_DEPLOY_STRATEGY=wrangler
SHPITTO_DEPLOY_BLOG_RUNTIME=1
SHPITTO_DEPLOY_BLOG_D1_BINDING=DB
CLOUDFLARE_D1_DATABASE_ID=

DEPLOY_WORKER_CLAIM_MODES=deploy
RAILWAY_WORKER_MODE=deploy
RAILWAY_DEPLOY_PREFLIGHT=1
CHAT_WORKER_POLL_MS=1200
CHAT_WORKER_STALE_RUNNING_MS=1200000
```

如 Railway 访问 Supabase 网络不稳定，可增加：

```env
SUPABASE_TASK_FETCH_TIMEOUT_MS=120000
SUPABASE_TASK_CONNECT_TIMEOUT_MS=120000
SUPABASE_TASK_FETCH_RETRIES=4
SUPABASE_TASK_PROXY_URL=http://127.0.0.1:7890
```

如果未设置 `SUPABASE_TASK_PROXY_URL`，task store 会按顺序读取 `HTTPS_PROXY` / `HTTP_PROXY`。这些代理只用于 Supabase task store fetch，不改变普通应用请求语义。

### 15.15 部署结果与 Smoke Gate

部署任务成功前必须通过以下线上 smoke：

- `GET /` 返回 `200` 且为 HTML。
- `GET /blog/` 返回 `200` 且为 HTML。
- `GET /api/blog/posts` 返回 `200` 且 `content-type` 为 JSON（启用动态 runtime 时必选）。
- `GET /blog/rss.xml` 返回 `200` 且为 XML。
- `GET /sitemap.xml` 返回 `200` 且包含 Blog URL。
- `GET /shpitto-blog-runtime.json` 返回 `mode = deployment-d1-runtime`（启用动态 runtime 时必选）。

任务成功结果必须写入：

- `deployedUrl`
- `deploymentStrategy`：`wrangler` 或 `direct-upload`
- `blogRuntimeStatus`：例如 `active:DB`、`snapshot:{count}`、`snapshot:failed`
- `wranglerDeploymentUrl`
- `productionUrl`
- `smokeChecks`

如果 Blog runtime 已启用但 `/api/blog/posts` 返回 HTML、404 或非 JSON，必须判定为部署失败，不能只因为首页可访问就返回成功。

### 15.16 当前实现与后续扩展点

当前已经落地：

- D1 schema：`shpitto_blog_posts`、`shpitto_blog_post_revisions`、`shpitto_blog_assets`、`shpitto_blog_settings`
- 后台 tab：`data -> blog`
- 后台 API：文章列表、新建、读取、更新、删除
- Milkdown 编辑器：使用 `@milkdown/crepe` 接入，编辑体验为富文本 Markdown，保存仍写入 `content_md`
- Milkdown 正文图片上传：复用 `/api/projects/{projectId}/blog/{postId}/assets` 写入 R2，正文上传不自动覆盖封面
- Blog settings：后台可编辑启用状态、导航标签、首页精选数量、RSS 和 sitemap 开关
- Markdown 工具：slug 归一化、HTML 渲染、纯文本摘要
- 公开页：`/blog`、`/blog/[slug]`
- SEO 输出：`generateMetadata`、`sitemap.xml`、`robots.txt`、`/blog/rss.xml`
- 分类/标签页：`/blog/category/[category]`、`/blog/tag/[tag]`
- R2 图片上传：`/api/projects/{projectId}/blog/{postId}/assets` 上传图片、写入 `shpitto_blog_assets`，并可自动回填文章封面；后台可列出、复制 URL、删除资源
- Scheduled 发布：`/api/blog/scheduled-publish` 可把到期 `scheduled` 文章转为 `published`
- 生成期 Blog 数据源页：页面生成 prompt 明确要求 `/blog` 生成站点原生数据挂载与 fallback cards，不生成数据库访问代码
- 部署期 Blog snapshot：Cloudflare Pages 部署包自动注入静态 Blog HTML、RSS、`/shpitto-blog-snapshot.json`、`/shpitto-blog-post-shell.html` 和 `/shpitto-blog-theme.json`
- 可选 Blog runtime：显式设置 `SHPITTO_DEPLOY_BLOG_RUNTIME=1` 时，部署包额外注入 `/_worker.js`、`/_routes.json` 与 `/shpitto-blog-runtime.json`，并动态渲染 `/blog/{slug}/`
- Pages D1 binding：动态 runtime 模式需要；`CloudflareClient.createProject` 支持在 Pages project 的 production/preview deployment config 中写入 D1 binding
- Wrangler adapter：`cloudflare-pages-wrangler.ts` 可将 `Bundler` 产物物化为 Pages 部署目录，并执行 `wrangler pages deploy`
- Deploy worker：`deploy-task-worker.mts` 默认只 claim `deploy` 任务，可部署在 Railway 常驻运行
- Railway start dispatcher：`railway:start` 根据 `RAILWAY_WORKER_MODE` 启动 chat、deploy 或 deploy-preflight 模式，默认保持 chat worker 兼容
- Deploy worker preflight：`deploy-worker:preflight` 可验证 Supabase、Cloudflare、D1、代理和 Wrangler CLI 是否可用
- Worker claim 分流：`claimNextQueuedChatTask` 支持按 `generate/refine/deploy` execution mode 过滤
- 动态 runtime smoke：启用 Wrangler Blog runtime 后，部署成功前必须验证 `/api/blog/posts` 返回 JSON、`/blog/` 返回 HTML、RSS/sitemap/runtime metadata 可访问
- 真实 Wrangler smoke：`smoke:blog-runtime:wrangler` 会创建临时 Pages 项目、通过 Wrangler 发布 Blog runtime、验证 JSON/HTML/RSS/sitemap 后删除临时项目
- 默认内容：仅用于未绑定公开 blog project 或开发环境兜底

后续可继续扩展：

- 继续完善 Milkdown 拖拽粘贴上传提示、失败重试和图片库选择
- 将 runtime smoke 扩展为在存在 published post 时验证 `/blog/{slug}/` 的 shell 语言、主题资源和正文输出
- 将 Railway deployer 的运行日志同步到独立 deployment task 表，支持更细粒度的部署历史审计

R2 图片上传约束：

- 仅允许图片 MIME 或常见图片扩展名：`png`、`jpg`、`jpeg`、`gif`、`webp`、`svg`、`avif`
- 默认最大上传大小为 `8MB`，可通过 `BLOG_IMAGE_UPLOAD_MAX_BYTES` 调整
- 必须配置 `R2_PUBLIC_BASE_URL`，因为公开 blog 页面需要无需登录即可访问的稳定图片 URL
- 上传前必须已存在文章；若用户还没有文章，需要先创建 draft
- 定时发布接口必须配置 `SHPITTO_CRON_SECRET` 或 `CRON_SECRET`，调用时使用 `Authorization: Bearer <secret>`
- 部署站点 Blog snapshot 需要配置 `CLOUDFLARE_D1_DATABASE_ID` / `CLOUDFLARE_D1_DB_ID` / `D1_DATABASE_ID` 中任一项，部署阶段通过服务端 D1 API 读取 published posts
- 如需启用动态 runtime，设置 `SHPITTO_DEPLOY_BLOG_RUNTIME=1`，D1 binding 名默认 `DB`，可通过 `SHPITTO_DEPLOY_BLOG_D1_BINDING` 调整；生产环境必须同时使用 `CLOUDFLARE_DEPLOY_STRATEGY=wrangler`
- 可运行 `pnpm --dir apps/web smoke:blog-runtime` 做只读 smoke：检查 Cloudflare/D1 env 是否存在、验证注入的 `_worker.js` 语法、并对 D1 执行 `SELECT 1`。该命令不打印密钥、不部署、不写数据。
- 可运行 `pnpm --dir apps/web deploy-worker:preflight` 验证 Railway deployer 所需 Supabase、Cloudflare、D1、代理和 Wrangler CLI 配置。该命令只打印变量存在状态和长度，不打印密钥。
- 可运行 `pnpm --dir apps/web smoke:blog-runtime:wrangler` 做真实 Wrangler 临时部署验证；脚本会自动删除 `shpitto-blog-wrangler-smoke-*` 临时 Pages 项目。
- 如需真实部署 smoke，可在本地临时设置 `SHPITTO_BLOG_RUNTIME_DEPLOY_SMOKE=1` 后运行同一命令。脚本会先确保 D1 schema ready，创建唯一临时 Cloudflare Pages 项目，部署最小 Blog snapshot 站点，访问 `/blog/` 验证 Direct Upload 可服务 Blog 页面，然后删除该临时项目。

### 15.17 验证要求

每次修改 blog 功能后至少执行：

- `pnpm --dir apps/web exec eslint ...`
- `pnpm --dir apps/web exec vitest run lib/blog.test.ts`
- `pnpm --dir apps/web exec vitest run lib/deployed-blog-snapshot.test.ts lib/deployed-blog-runtime.test.ts lib/cloudflare.test.ts lib/skill-runtime/executor.deploy.test.ts`
- `pnpm --dir apps/web smoke:blog-runtime`
- `pnpm --dir apps/web deploy-worker:preflight`
- `pnpm --dir apps/web smoke:blog-runtime:wrangler`（需要真实 Cloudflare 凭据，使用临时项目并自动清理）
- `pnpm --dir apps/web exec tsc --noEmit --pretty false -p tsconfig.json`
- `pnpm --dir apps/web build`

验证通过后才允许声明完成。
