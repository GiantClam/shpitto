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
- Worker：`apps/web/scripts/chat-task-worker.ts`
- Runtime：`apps/web/lib/skill-runtime/executor.ts`

4. 产物层（本地 checkpoint + R2）
- 职责：保存中间步骤产物与最终站点文件，支持进度可视化和排障。
- 代码：`apps/web/lib/skill-runtime/executor.ts`（`persistStepArtifacts`）

5. 编排与部署层（Graph）
- 职责：对话意图/部署入口编排（生成主路径已迁移到 runtime）。
- 代码：`apps/web/lib/agent/graph.ts`

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

---

## 14. 一页结论

当前网站生成系统已形成“异步任务 + skill runtime + 文件级产物 + 可观测”的完整闭环，核心链路可运行、可排障、可回归。接下来若目标是“完全对齐 opencode 执行语义”，应继续削减修复/兜底层，把主路径进一步收敛到“按文件直接生成 + 当轮修正 + 失败即报错”。
