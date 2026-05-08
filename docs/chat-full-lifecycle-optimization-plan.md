# Chat 全生命周期优化方案（需求梳理优先，不破坏现有生成链路）

## 1. 背景与目标

当前 Chat 已具备基础 human-loop（需求梳理 -> 确认生成）能力，但仍存在三类体验与架构缺口：

1. 对话生命周期被割裂：生成前、预览中、部署后没有统一的会话编排规则。  
2. 梳理逻辑主要基于单条消息，无法稳定利用多轮上下文。  
3. 预览阶段/部署后“微调”能力不足，常退化为整站重生成。

本方案目标：

1. 建立统一的全生命周期对话编排：`drafting -> previewing -> deployed -> previewing(新版本)`。  
2. 不新增固定动作按钮，按“用户消息 + 当前状态”动态判定下一步（继续补充/直接生成/微调/部署）。  
3. 明确硬约束：**不破坏现有 `website-generation-workflow` 生成与部署主链路**，新增能力优先放在 Chat 编排层和独立微调通道。

---

## 2. 硬约束（必须满足）

1. 不修改现有完整生成主路径语义：`POST /api/chat -> createChatTask -> worker -> SkillRuntimeExecutor.runTask`。  
2. 不改变现有 `website-generation-workflow` 的输入输出契约（生成产物结构、部署语义保持兼容）。  
3. 新增逻辑以“需求梳理/意图编排”为主，执行层只做路由分发，不侵入现有全量生成流程。  
4. 微调能力以新通道实现（新增 edit/refine 路径），不在现有 full-generate skill 中硬塞分支。
5. 当前阶段不引入 Mastra 等新编排框架，统一基于现有 LangGraph + Chat API 编排能力实现。

---

## 3. 现状评估（基于当前代码）

### 3.1 已有能力

1. 已有 human-loop 雏形：  
   - 未确认时返回需求梳理与草稿，不创建任务。  
   - 时间线已有 `requirement_progress` / `prompt_draft` / `confirm_generate` 卡片。  
2. 异步任务链路成熟：任务表、worker、进度事件、checkpoint、部署路径完整。  
3. 预览链路已修复：支持 `preview/index.html` 与 checkpoint 回退解析。

### 3.2 关键缺口

1. 需求槽位判断偏单轮消息，缺少稳定的多轮聚合。  
2. 预览与部署后对话缺少“显式状态机 + 意图路由”。  
3. 现有 full-generate 执行器不等价于“基于已有代码微调”：  
   - tool-mode 默认从空文件集开始构建；  
   - legacy mode 对已存在页面会跳过，不会按新需求定向改动。  
4. 因此“上线后继续对话改版”需要独立微调执行路径。

---

## 4. 总体架构（新增为编排层，执行层最小改动）

### 4.1 新增对话编排层（Chat Orchestrator）

位置：`apps/web/app/api/chat/route.ts`（扩展，不替换现有 API）

职责：

1. 聚合会话上下文（结构化槽位状态 + 证据账本 + 会话摘要），而不是仅拼接最近几轮消息。  
2. 计算当前会话阶段（drafting/previewing/deployed/deploying）。  
3. 意图判定（clarify / generate / refine_preview / refine_deployed / deploy）。  
4. 将请求路由到对应任务通道（full-generate / refine / deploy-only）。

### 4.2 执行通道拆分

1. `full-generate`（保留现有）：调用 `website-generation-workflow`。  
2. `deploy-only`（保留现有）：复用现有 deploy 路径。  
3. `refine`（新增）：基于现有项目 JSON 做增量修改（独立执行器/skill）。

---

## 5. 对话状态机设计

会话阶段定义（逻辑状态，不要求强依赖新表）：

1. `drafting`：无可用站点基线，仅需求梳理。  
2. `previewing`：存在最新可预览产物（checkpoint + generated files）。  
3. `deployed`：存在已部署 URL 且有对应版本基线。  
4. `deploying`：部署任务进行中。

状态来源优先级：

1. 最新 task 状态与 result.progress。  
2. 会话上下文 `workflow_context` 中的 `checkpointProjectPath / deploySourceTaskId / deployed_url`。  
3. 时间线最近事件作为兜底。

---

## 6. 意图判定（无固定动作按钮）

### 6.1 判定原则

输入：`userText + conversationState + latestTaskMeta + requirementSlots`  
输出：`intent + confidence + missingSlots + assumedDefaults`

意图枚举：

1. `clarify`：继续补充需求。  
2. `generate`：触发完整生成。  
3. `refine_preview`：基于当前预览版本微调。  
4. `refine_deployed`：基于已发布版本微调。  
5. `deploy`：部署当前已确认版本。  

### 6.2 实施策略

1. 先规则判定（显式词、状态约束、任务冲突）。  
2. 再 LLM 判定（仅歧义输入）。  
3. 低置信度时最小追问，不抛长问卷。  
4. 不新增固定按钮；按钮仅允许作为“可选快捷入口”，不是必须路径。

---

## 7. 需求梳理增强（多轮聚合）

### 7.1 槽位模型（可复用现有）

沿用现有核心槽位：品牌定位、受众、页面结构、视觉系统、内容模块、CTA、语言语气、部署偏好。  
但每个槽位不再只保存“当前值”，而是保存一个结构化状态对象：

1. `value`
   - 当前系统采用的槽位值。
2. `status`
   - `confirmed | inferred | conflicting | empty`
3. `source`
   - `user_explicit | user_form | assistant_summary | system_default | imported_asset | web_research`
4. `confidence`
   - 0-1 或离散等级，供意图判定和追问策略使用。
5. `evidence`
   - 若干证据片段，记录该值来自哪条消息、哪份文件、哪次摘要。
6. `updatedAt`
   - 最近一次变更时间，用于调试和回溯。

另外需要区分三类槽位：

1. 稳定事实槽位
   - 如品牌名、部署域名、语言、产品类别。
   - 默认不可被模糊表述轻易覆盖，只能被显式更正。
2. 偏好槽位
   - 如视觉方向、语气、内容密度、CTA 倾向。
   - 允许补充和细化，但要保留主次关系与冲突信息。
3. 任务指令槽位
   - 如“这次只改 hero”“不要动配色”“先上线再改详情页”。
   - 作用域通常只限当前阶段或当前 revision，不能永久污染全局偏好。

### 7.2 多轮聚合规则

不采用“读取最近 N 条消息 + 新消息覆盖旧值”的简单策略，而采用证据驱动聚合。

1. 输入层分三路进入聚合器
   - 用户显式输入：自然语言消息、表单提交、快捷操作。
   - 系统派生输入：上轮摘要、任务状态、checkpoint 元数据、部署结果。
   - 外部证据输入：上传文件、旧站抓取、研究结果、结构化解析结果。
2. 每次用户输入先被解析为 `RequirementDelta`
   - `set`: 明确设定新值，例如“主色改成深绿”。
   - `append`: 补充信息，例如“再加一个案例页”。
   - `remove`: 明确取消，例如“先不要英文版”。
   - `correct`: 明确纠正旧值，例如“不是 B2C，是工业 B2B”。
   - `scope`: 只作用于当前改动范围，例如“这次只改首页 hero”。
3. 槽位更新必须遵守类型化合并规则
   - 稳定事实槽位：只有 `set/correct` 且置信度更高时才覆盖。
   - 偏好槽位：允许叠加，但必须记录主次、冲突和来源。
   - 任务指令槽位：默认写入当前阶段上下文，不进入长期偏好。
4. 冲突不直接覆盖，先进入 `conflicting` 状态
   - 例如前面说“极简科技感”，后面又说“粗野实验海报感”。
   - 系统应保留两组证据，并在必要时只追问一条冲突最高的问题。
5. 明确纠正永远高于旧摘要
   - 用户后续显式更正必须优先于 assistant 草稿、默认值和启发式推荐。
6. 证据账本长期保留，摘要只做压缩视图
   - 不把 assistant 摘要当作唯一事实来源。
   - 摘要丢失时仍可从证据账本恢复关键槽位。
7. 聚合完成后生成 `RequirementState`
   - 包含 `slots`、`conflicts`、`missingCriticalSlots`、`readyScore`、`activeScope`、`assumptions`。
8. 每轮只暴露 1-2 个最影响推进的问题
   - 优先问高冲突槽位、强阻塞槽位、会显著改变站点结构的槽位。
9. 达到阈值（如 70%）且无强阻塞时，可直接 `generate`
   - 但必须把默认值和系统假设显式写入 canonical prompt 或 timeline。

### 7.3 输出形式

继续保留时间线可视化卡片（进度/草稿），但不依赖固定动作按钮驱动流程。  
同时输出三层上下文，而不是只有一段草稿文本：

1. 面向用户的简短草稿
   - 用于展示当前理解和待确认点。
2. 面向编排器的结构化 `RequirementState`
   - 用于意图判定、缺口检测和任务路由。
3. 面向运行时的可执行上下文
   - 用于生成 canonical prompt、visual contract、scope lock 和 revision 绑定。

### 7.4 Memory 实现建议

多轮聚合不应只靠应用层手工拼接消息，建议显式利用 LangGraph 的 memory 能力。

1. 短期 memory
   - 使用 LangGraph `checkpointer` 保存当前线程的 `RequirementState`、意图状态、active scope、revision 指针和最近摘要。
   - 这部分服务于同一 chat/thread 的连续对话。
2. 长期 memory
   - 使用 LangGraph `store` 或等价持久层保存跨会话偏好，例如品牌常用语气、默认语言、部署偏好、稳定的主视觉方向。
   - 这部分必须区分“用户长期偏好”和“当前任务临时指令”。
3. 读取顺序
   - 当前线程短期 memory > 当前任务显式输入 > 长期偏好 > 系统默认值。
4. 写入原则
   - 只有用户明确表达且跨任务稳定的信息，才进入长期 memory。
   - 当前轮的临时微调指令、单次页面 scope、一次性 campaign 要求只进入短期 memory。

### 7.4.1 多实例部署下的 memory 优化

当前 `chat-memory.ts` 已经具备 LangGraph 语义上的短期/长期 memory，但文件持久化只适合单节点或本地 checkpoint 场景。若后续进入多实例部署，需要把持久层从本地文件切换到共享存储，同时保持上层编排 API 不变。

优化原则：

1. 保持 `readChatShortTermMemory/writeChatShortTermMemory/readChatLongTermPreferences/writeChatLongTermPreferences` 这组 API 不变，只替换 backend。  
2. backend 至少支持两种实现：
   - `file`：本地开发、单机回归、无数据库环境。  
   - `supabase`：多实例生产环境的共享存储。  
3. 默认行为保持保守：
   - 未显式开启共享 backend 时，继续使用 `file`，避免对当前单机流程造成破坏。  
   - 多实例环境通过环境变量显式切换到 `supabase`。  
4. 长期偏好写入必须支持字段级合并，不能因为一次只更新语言或域名，就把其他长期偏好覆盖掉。  
5. 短期 thread memory 写入必须支持乐观并发控制，避免多实例同时写回时产生静默覆盖。

推荐 backend 选择：

1. 优先使用现有 Supabase/Postgres，而不是新引入 Redis。  
2. 原因：
   - 仓库已有 Supabase 管理端接入与 schema 约定，接入成本最低。  
   - memory 负载以结构化 JSON 读写为主，更适合数据库持久化与审计。  
   - 后续若要做问题排查、回放或导出，数据库查询能力明显优于纯缓存。  

配置建议：

1. 新增环境变量 `CHAT_MEMORY_BACKEND=file|supabase`。  
2. `file` 作为默认值。  
3. 只有在 Supabase schema 已完成且环境已配置的部署环境，才开启 `supabase`。  

并发策略：

1. 为共享存储表增加 `version` 字段。  
2. 更新时按 `where primary_key = ? and version = ?` 执行，成功后 `version + 1`。  
3. 若更新命中 0 行，则重新读取并重试。  
4. 短期 memory 允许“重新读取后基于最新快照覆盖本次完整状态”。  
5. 长期 memory 必须先做字段级合并，再写回新版本。

---

## 8. 预览后与部署后微调方案（新增 refine 通道）

## 8.1 设计原则

1. 微调优先：局部改动不触发整站重生成。  
2. 基线明确：每次微调必须绑定来源版本（preview checkpoint 或 deployed revision）。  
3. 可回滚：每次微调形成新 revision，可重新预览与部署。

### 8.2 推荐实现路径

新增 `site-refine` 执行器（或 `website-refine-workflow`）：

1. 输入：`baseProjectJson + refineInstruction + optionalScope(files/routes)`  
2. 输出：`patchedProjectJson + changedFiles + validationReport`

流程：

1. 加载基线项目（来自 `checkpointProjectPath` 或 deploy 归档）。  
2. 生成“变更计划”（只选必要文件）。  
3. 对目标文件做 patch（HTML/CSS/JS 局部更新）。  
4. 运行验证（HTML 结构、资源引用、关键路由可打开）。  
5. 保存新 checkpoint 并进入 preview。

### 8.3 与现有 full-generate 的边界

1. 当请求是“大改/重构/信息架构重排”时，Orchestrator 才路由到 full-generate。  
2. 当请求是“文案、样式、组件布局、小交互”时，优先 refine。  
3. 任何时候用户可显式要求“全量重做”，再切回 full-generate。

---

## 9. 数据与版本管理方案

### 9.1 最小可行（优先）

先不新增 SQL 表，利用现有：

1. `chat task result.progress` 存 checkpoint 指针。  
2. `workflow_context` 存当前基线来源（taskId/projectPath/deployedUrl）。

### 9.1.1 共享 memory 存储（多实例增强）

当 chat orchestrator 进入多实例部署时，memory 持久层需要从本地文件迁移到共享存储。推荐新增两张表，而不是把 memory 混入 task 表：

1. `shpitto_chat_thread_memory`
   - `thread_id, stage, intent, intent_confidence, recent_summary, active_scope, revision_pointer jsonb, requirement_state jsonb, workflow_context jsonb, version, created_at, updated_at`
   - 用途：保存短期 thread memory，服务 `drafting/previewing/deployed/deploying` 阶段连续对话。
2. `shpitto_chat_user_preferences`
   - `owner_user_id, preferred_locale, primary_visual_direction, secondary_visual_tags jsonb, deployment_provider, deployment_domain, target_audience jsonb, tone, version, created_at, updated_at`
   - 用途：保存跨会话长期偏好，只接收显式稳定信息。

实施要求：

1. 短期表与长期表分离，避免 TTL、清理策略、覆盖规则相互污染。  
2. 两张表都要有 `updated_at` trigger 与索引。  
3. 短期表建议按 `updated_at` 做定期清理。  
4. 长期偏好表默认长期保留，仅在账号删除或隐私清理时删除。  
5. `chat-memory.ts` 只负责 backend 路由与 merge/retry 规则，不把共享存储细节泄漏到 route/executor 调用层。

### 9.1.2 shared memory 上线切换 checklist

本地开发与测试环境继续默认使用 `file` backend。只有在生产环境完成 schema、环境变量与回滚预案后，才切换到 `supabase` backend。

切换前检查：

1. 确认本地/测试环境未显式开启 `CHAT_MEMORY_BACKEND=supabase`，继续保持默认 `file` 或显式 `file`。  
2. 确认生产环境的 Supabase 管理端凭据已存在，且 `apps/web/lib/supabase/admin.ts` 依赖的环境变量可正常读取。  
3. 确认共享 memory schema 已准备完成，包含：
   - `shpitto_chat_thread_memory`
   - `shpitto_chat_user_preferences`
4. 确认上线窗口允许 memory backend 切换，并预留快速回滚到 `file` 的配置开关。  

上线步骤：

1. 在生产 Supabase 执行 `apps/web/supabase/chat_memory.sql`。  
2. 验证两张表、索引、RLS policy、`updated_at` trigger 已正确创建。  
3. 部署应用前，设置 `CHAT_MEMORY_BACKEND=supabase`。  
4. 发布后先验证一条新会话：
   - 能写入短期 thread memory
   - 能读取并更新长期 user preferences
   - refine / deploy 后 revision pointer 会继续推进
5. 验证现有 chat 主链路不受影响：
   - `/api/chat`
   - task worker
   - preview route
   - deploy route

上线后观察：

1. 观察 shared memory 读写错误日志、重试次数与 version 冲突次数。  
2. 检查是否出现 thread memory 写入成功但长期 preferences 未更新的分裂状态。  
3. 检查是否有异常回退到默认偏好，避免显式用户偏好丢失。  

回滚步骤：

1. 将 `CHAT_MEMORY_BACKEND` 改回 `file`。  
2. 重新部署应用，使 backend 路由立即回到本地文件实现。  
3. 保留 Supabase memory 表数据，不在紧急回滚时做删除操作。  
4. 基于日志排查 schema、权限、环境变量或并发冲突问题，再决定是否重新切换。  

迁移说明：

1. 当前阶段不要求把本地 file memory 自动迁移到 Supabase。  
2. 短期 thread memory 可自然重建。  
3. 若上线前必须保留长期偏好，再补一次性迁移脚本即可。

### 9.2 建议增强（第二阶段）

新增 `shpitto_chat_revisions`（可选）：

1. `id, chat_id, source_task_id, base_revision_id, mode(full|refine), checkpoint_project_path, deployed_url, created_at`  
2. 作用：明确版本链、支持回滚与审计。

---

## 10. 前端交互改造

位置：`apps/web/app/chat/page.tsx`

1. 主按钮文案改为“发送”（语义从“直接生成”改为“提交对话”).  
2. 输入区不承载固定“生成动作”；系统回复中展示当前判定结果。  
3. 时间线继续显示：需求进度、草稿摘要、当前阶段、任务状态、预览入口。  
4. 当系统判定为 `generate/refine/deploy`，自动进入对应任务并实时回显。

---

## 11. 与 LangGraph / Mastra / Assistant UI 的取舍

### 11.1 LangGraph

结论：继续作为主编排能力，且与当前代码栈保持一致。  
原因：仓库已落地 LangGraph 依赖与 worker 链路，复用成本最低、验证路径最短；历史记忆需求不应只靠会话摘要，建议利用 LangGraph `checkpointer` 承担线程级短期 memory，并用 `store` 承担跨会话长期偏好，同时继续保留槽位状态与 revision 指针。

### 11.2 Mastra

结论：当前阶段不引入。  
原因：本期目标是补齐 refine 通道与全生命周期编排，不是更换框架；引入 Mastra 会增加迁移与双栈维护成本，收益不足。  
后续评估触发条件：仅当 LangGraph 在工具编排复杂度或开发效率上成为明确瓶颈，再做独立技术评估。

### 11.3 Assistant UI

结论：可作为后续 UI 组件化升级选项，不作为当前必选依赖。  
原因：现有时间线卡片能力已覆盖 MVP；先把状态机与意图判定做稳定，再考虑 UI 框架迁移。

---

## 12. 分阶段落地计划

### Phase 1（低风险，先上线）

1. `发送`语义改造（前端按钮文案与提示文案）。  
2. `/api/chat` 增加状态机与意图判定骨架。  
3. 多轮需求聚合（不改执行器）。  
4. 保持 full-generate/deploy 链路不变。
5. 明确框架边界：不引入 Mastra，refine 通道沿用 LangGraph/现有执行器体系。

验收：

1. 不影响现有生成回归测试。  
2. 未确认消息不建任务，确认/明确生成意图才建任务。  
3. 预览与部署后对话可持续，且系统能给出正确意图判定。

本阶段测试用例（必须新增）：

1. `apps/web/lib/agent/chat-async-route.test.ts`：补充“普通 prompt 仅梳理不建任务”“确认生成才入队”。  
2. `apps/web/lib/agent/chat-orchestrator-intent.test.ts`（新增）：覆盖 `clarify/generate/deploy` 基础判定。  
3. `apps/web/lib/agent/chat-requirement-aggregation.test.ts`（新增）：覆盖多轮槽位聚合与覆盖更新规则。  
4. `apps/web/lib/agent/chat-state-machine.test.ts`（新增）：覆盖 `drafting/previewing/deployed/deploying` 状态判定。
5. `apps/web/lib/agent/chat-memory-backend.test.ts`（新增）：覆盖 `file/supabase` backend 一致性、长期偏好字段级合并与并发重试。

### Phase 2（能力增强）

1. 新增 refine 执行器（基于基线项目增量修改）。  
2. previewing/deployed 阶段默认优先 refine 路由。  
3. 增补版本链管理（可选 `chat_revisions`）。

验收：

1. 小改需求不触发整站重建。  
2. 每次微调生成新 revision，可预览、可部署、可回滚。

本阶段测试用例（必须新增）：

1. `apps/web/lib/agent/chat-refine-route.test.ts`（新增）：覆盖 `refine_preview/refine_deployed` 路由。  
2. `apps/web/lib/agent/chat-refine-worker.test.ts`（新增）：覆盖 refine 成功、失败回滚、校验失败分支。  
3. `apps/web/lib/agent/chat-history-memory.test.ts`（新增）：覆盖 revision 指针、deployed_url、checkpoint 继承。  
4. `apps/web/lib/agent/chat-task-preview-route.test.ts`（新增或并入现有测试）：覆盖 `preview/index.html` 与 fallback 解析。

### Phase 3（体验打磨）

1. 策略优化：意图置信度、默认值解释、追问压缩。  
2. 视情况接入 Assistant UI 统一消息组件。  

本阶段测试用例（必须新增）：

1. `apps/web/lib/agent/chat-intent-confidence.test.ts`（新增）：覆盖低置信最小追问与不误触发任务。  
2. `apps/web/lib/agent/chat-ux-timeline.test.ts`（新增）：覆盖时间线卡片与阶段提示一致性。  
3. `apps/web/lib/agent/chat-entry-full-flow.test.ts`：扩展到“生成后多轮微调 + 再部署”。

### 12.4 文件级实施任务清单（可直接执行）

1. `apps/web/app/api/chat/route.ts`：实现状态机读取、意图判定路由、多轮需求聚合入口。  
2. `apps/web/lib/agent/chat-task-store.ts`：补齐 `workflow_context` / revision 指针读写与查询接口。  
3. `apps/web/lib/skill-runtime/executor.ts`：新增 refine 执行入口（不改现有 full-generate/deploy 语义）。  
4. `apps/web/scripts/chat-task-worker.mts`：接入 refine 任务类型执行与失败回滚处理。  
5. `apps/web/app/api/chat/tasks/[taskId]/preview/[...path]/route.ts`：确保 refine 后 preview fallback 与 root/index 一致。  
6. `apps/web/app/chat/page.tsx`：发送语义、时间线状态文案、任务阶段提示联动。  
7. `apps/web/lib/agent/chat-*.test.ts`：按本方案新增/扩展各环节单元与集成测试。  
8. `apps/web/lib/agent/chat-lifecycle-regression.test.ts`：新增模拟用户输入全分支回归门禁用例。

---

## 13. 测试与验收清单

### 13.1 回归（必须）

1. `chat-async-route` 全通过。  
2. `chat-entry-full-flow` 全通过。  
3. 预览 API 与 `preview/index.html` 可用。

### 13.2 分环节测试矩阵（每个环节都要有）

1. 需求梳理环节：
   `chat-requirement-aggregation.test.ts`，验证多轮补充、槽位覆盖、默认值声明。  
2. 意图判定环节：
   `chat-orchestrator-intent.test.ts`，验证 `clarify/generate/refine_preview/refine_deployed/deploy`。  
3. 任务入队环节：
   `chat-async-route.test.ts`，验证确认前不建任务、确认后建任务、活跃任务去重。  
4. worker 执行环节：
   `chat-entry-full-flow.test.ts` + `chat-refine-worker.test.ts`，验证 full-generate 与 refine 各自执行。  
5. 预览环节：
   `chat-task-preview-route.test.ts`，验证 root/index 路径、checkpoint fallback、404/202 分支。  
6. 部署环节：
   `chat-entry-full-flow.test.ts`，验证 deploySourceTaskId/projectPath/deployedUrl 全链路。  
7. 历史记忆环节：
   `chat-history-memory.test.ts`，验证会话摘要、workflow_context、revision 继承正确性。  
9. memory backend 环节：
   `chat-memory-backend.test.ts`，验证共享存储 backend 的乐观并发与字段级合并正确性。  
8. 失败与回滚环节：
   `chat-refine-worker.test.ts`，验证 refine 校验失败自动回退与错误透出。

### 13.3 测试执行命令（建议）

1. `pnpm --filter web test -- lib/agent/chat-async-route.test.ts lib/agent/chat-entry-full-flow.test.ts`  
2. `pnpm --filter web test -- lib/agent/chat-orchestrator-intent.test.ts lib/agent/chat-requirement-aggregation.test.ts lib/agent/chat-state-machine.test.ts`  
3. `pnpm --filter web test -- lib/agent/chat-refine-route.test.ts lib/agent/chat-refine-worker.test.ts lib/agent/chat-task-preview-route.test.ts`  
4. `pnpm --filter web test -- lib/agent/chat-history-memory.test.ts lib/agent/chat-intent-confidence.test.ts lib/agent/chat-ux-timeline.test.ts lib/agent/chat-lifecycle-regression.test.ts`

---

## 14. 模拟用户输入回归用例（最终门禁）

目标：通过一组“用户真实对话脚本”覆盖所有关键流程分支，作为发布前强制回归。

建议新增：`apps/web/lib/agent/chat-lifecycle-regression.test.ts`

必须覆盖分支：

1. `drafting -> clarify -> generate`：
   用户先给模糊需求，系统主动补充问题，用户确认后建任务。  
2. `drafting -> generate`（直接明确）：
   用户一次性提供完整需求，系统直接触发生成。  
3. `previewing -> refine_preview`：
   用户在预览阶段连续两轮改细节，均走 refine，不触发 full-generate。  
4. `previewing -> deploy`：
   用户确认预览后直接部署。  
5. `deployed -> refine_deployed -> deploy`：
   用户基于已发布版本改标题/配色，再次发布。  
6. `low-confidence -> clarify`：
   用户输入歧义指令，系统仅追问，不建任务。  
7. `active-task -> dedupe`：
   同一会话连续点击发送，系统复用已有进行中任务。  
8. `refine-failed -> rollback`：
   微调失败自动回退到上一个可用 revision，且时间线有错误说明。

门禁要求：

1. 上述 8 条分支全部通过后才能合并。  
2. 任一分支失败视为阻塞问题，不允许仅凭人工验证放行。  
3. 回归文件执行时长控制在 5 分钟内，超时需拆分并行执行。

---

## 15. 风险与缓解

1. 风险：意图误判导致错误路由。  
   - 缓解：规则优先 + 置信度阈值 + 低置信追问。  

2. 风险：微调执行器破坏页面结构。  
   - 缓解：文件级验证、失败自动回退到上个 revision。  

3. 风险：上下文累积导致提示词膨胀。  
   - 缓解：结构化槽位摘要，不直接拼接全量历史。

---

## 16. 最终结论

1. 现有 `website-generation-workflow` 主链路保持不动，继续承担完整生成。  
2. Chat 侧新增“全生命周期编排 + 多轮需求聚合 + 动态意图判定”。  
3. 预览/部署后微调通过新增 refine 通道落地，不强行改造现有 full-generate skill。  
4. 框架选择保持稳定：当前阶段继续使用 LangGraph，不引入 Mastra。  
5. 每个环节都必须有自动化测试，最终由“模拟用户输入全分支回归”作为发布门禁。  
6. 全方案可分阶段上线，先低风险提升体验，再补齐微调能力闭环。

---

## 17. 交互策略补充：对话优先，workflow 内核化

本节用于补足上一版方案中容易被误解的部分。它不替换现有生命周期、任务队列、checkpoint 或部署链路，只调整用户可见的入口形态与路由策略。

### 17.1 产品原则

1. 用户主入口应是自然语言对话，而不是固定 workflow。
   - 用户可以直接说“生成一个官网”“把 hero 改得更克制”“上线当前版本”。
   - 系统内部再决定路由到 `clarify`、`generate`、`refine_preview`、`refine_deployed` 还是 `deploy`。
2. workflow 只作为执行内核存在。
   - 生命周期、状态机、队列、checkpoint、回滚和部署校验都保留。
   - 用户只感知少量状态：补充中、生成中、预览中、部署中、已上线。
3. skill 调用是能力，不是用户步骤。
   - 动态 skill discovery 和 intent scoring 继续保留为底层能力。
   - 前台不暴露“先选 skill 再开始”的强流程。
4. 视觉方向是推荐约束，不是强制门槛。
   - `design-directions.ts` 继续提供方向卡与视觉合同。
   - 低置信度时再追问，高置信度时可自动吸收，不应阻塞生成。
   - 当前优先级是“只做推荐，不加确认步骤”，避免把主题推荐重新做成显式 workflow。
5. 固定按钮保留为快捷入口，不保留为唯一入口。
   - 允许“继续生成”“微调当前预览”“部署当前版本”等显性操作。
   - 但这些按钮只是快捷方式，不能替代自然语言意图路由。

### 17.2 交互落点

1. `apps/web/components/chat/ProjectChatWorkspace.tsx`
   - 主按钮文案建议从“生成”调整为“发送/提交”，弱化流程感。
   - 去掉强流程式的固定动作集合，把动作按钮降级为上下文快捷入口。
   - 保留时间线、状态卡、预览与部署结果，但不把它们做成必须依次通过的表单门禁。
2. `apps/web/lib/agent/chat-orchestrator.ts`
   - 以 `userText + conversationState + latestTaskMeta + requirementSlots` 做统一意图判定。
   - 让对话上下文优先于单条消息，减少“只有单轮输入才可生成”的限制。
   - 生成、微调、部署都通过同一套意图路由分发。
3. `apps/web/lib/skill-runtime/project-skill-loader.ts`
   - 保持网站 seed skill 的动态发现。
   - skill 选择基于 `SKILL.md` frontmatter、trigger、scenario 和意图得分，不在 TS 里写死具体 skill 分支。
4. `apps/web/lib/open-design/design-directions.ts`
   - 继续作为视觉方向合同库。
   - 由“必选步骤”改成“推荐约束”，用于自动选择、默认推荐和低置信度追问。

### 17.3 验收标准

1. 用户可以只用自然语言完成从需求描述到生成、预览、微调、部署的全链路。
2. 用户不需要先选择 workflow 或 skill 名称。
3. 已生成项目的微调不会强制回到 full-generate。
4. 已部署项目可以通过自然语言进入 refine_deployed 或 deploy-only。
5. 视觉方向在高置信度下可自动应用，在低置信度下才追问确认。
6. 系统内部仍保留完整生命周期状态，但不会把状态机暴露成主交互骨架。

### 17.4 当前已落地的轻量实现

这部分已经按轻量策略落地，核心目标是“只做推荐，不加确认步骤”。

1. `apps/web/lib/open-design/design-directions.ts`
   - 新增 `recommendWebsiteDesignDirections()`。
   - 推荐器只基于现有表单信号做规则打分：`siteType`、`targetAudience`、`primaryGoal`、`contentSources`、`customNotes`，并允许吸收已有 `secondaryVisualTags` / `functionalRequirements` 的自由文本线索。
   - 推荐结果仍然映射回现有 open-design 方向，不暴露 awesome-design，也不突破当前主题抽象边界。
2. `apps/web/components/chat/ProjectChatWorkspace.tsx`
   - 主题区域先展示“推荐主题”及一条简短理由，再展示“全部主题”。
   - 用户仍然直接勾选已有方向，提交链路不变。
   - 没有新增确认卡片、中间步骤或额外的人机往返。
3. `apps/web/lib/open-design/design-directions.test.ts`
   - 已新增推荐规则测试，覆盖制造业、开发者产品、内容导向品牌和空信号场景。

### 17.5 当前边界与后续建议

1. 当前边界
   - 推荐是启发式的、前端可见但不强制。
   - awesome-design 继续留在后台参考层，不进入用户主题选择层。
   - 这套推荐只影响用户在表单中的感知排序，不直接改变生成 prompt。
2. 下一步建议
   - 只做一件事：当用户未显式选择主题时，把推荐结果同步进 prompt，作为默认视觉倾向。
   - 这一步应保持无确认、无新卡片、无新 workflow 阶段，只在生成器输入层增强默认约束。
   - 若用户已经显式选择主题，则用户选择始终高于推荐结果。

### 17.5.1 默认视觉倾向注入规则

这一条作为明确实施规则，而不只是方向性建议：

1. 仅当用户未显式选择主题时，才允许把推荐结果同步进 prompt。
2. 同步方式是“默认视觉倾向”，不是“已确认主题”。
3. 注入位置在生成器输入层，例如 canonical prompt 或等价 runtime context，不增加任何用户侧确认步骤。
4. 不新增确认卡片，不新增中间页面，不新增 workflow 阶段。
5. 一旦用户已经显式选择主题，用户选择始终高于推荐结果，推荐器只保留为参考信号，不得反向覆盖。
6. 若存在主主题字段，则默认注入只能填充 `primaryVisualDirection` 的系统推断值，并标记 `visualDecisionSource = "user_recommended_default"`，不得伪装成 `user_explicit`。

### 17.6 严谨性评估：当前版本适合 MVP，不适合作为长期主题系统

1. 当前合理之处
   - 前端只把 open-design 当成推荐和选择层，不新增确认步骤，这个产品决策成立。
   - 用户选中的主题已经进入 `visualStyle`，并参与 canonical prompt 与 visual contract 注入。
   - `prompt-adaptive` 不是无门槛触发，当前已有显式视觉信号阈值保护。
2. 当前主要缺口
   - 优先级链路不够清晰。
   - 一旦命中 `prompt-adaptive`，运行时可能直接绕过固定模板决策，导致“前台显式选主题”和“最终模板来源”不是同一条强约束链路。
   - 推荐器是简单加分模型，缺少负向约束、冲突消解和主辅关系。
   - 当前允许多选主题，但没有“主主题 / 辅标签”区分，`visualStyle` 更像标签堆叠，不像稳定的视觉决策。
   - open-design 与 awesome-design 之间仍然主要靠文本桥接，而不是结构化桥接，导致可解释性和可控性都不足一层。
3. 结论
   - 作为当前阶段的 MVP：合理。
   - 作为长期稳定的主题选择系统：不够严谨，需要最小收敛。

### 17.7 最小收敛方案：不增加确认步骤，只压住主题漂移

本方案只改主题决策链，不改用户交互步骤，不增加确认卡片。

1. 明确优先级
   - `用户显式选中的 open-design 主主题 > prompt-adaptive > 推荐器默认倾向 > generic fallback`
   - 当存在显式主主题时，runtime 不得用 `prompt-adaptive` 替换主主题类别。
2. 把主题从“多选标签”收缩成“1 个主主题 + 若干辅标签”
   - 主主题承担站点的主视觉类别，例如 `industrial-b2b`、`modern-minimal`、`heritage-manufacturing`。
   - 辅标签只表达补充倾向，例如温暖、极简、专业、可信、蓝色、高对比。
   - UI 仍可保持轻量多选体验，但底层提交结构必须能区分主次。
3. 让 `prompt-adaptive` 只补充，不替换主类别
   - 有显式主主题时，`prompt-adaptive` 只能补颜色、字体、语气、密度、材质、对比度等 style preset。
   - 它不能把主主题从 `heritage-manufacturing` 改成另一类 awesome-design 模板。
4. 只有在用户没选主主题时，才允许 `prompt-adaptive` 主导模板决策
   - 这时它仍然可以根据 prompt 中的明确视觉语言选择 `prompt-adaptive`。
   - 但这应被记录为“系统推断主主题”，而不是与“用户明确选择主主题”等价。

### 17.8 结构化桥接方案

当前 open-design 与 runtime 之间主要靠 prompt 文本传递主题信息，建议增加一层结构化决策对象。

1. 建议新增结构
   - `primaryVisualDirection?: string`
   - `secondaryVisualTags?: string[]`
   - `visualDecisionSource?: "user_explicit" | "user_recommended_default" | "prompt_adaptive" | "fallback"`
   - `lockPrimaryVisualDirection?: boolean`
2. 建议传递路径
   - 表单层生成主主题与辅标签。
   - `chat-orchestrator.ts` 在 canonical prompt 之外，把上述结构同时写入 `workflow_context` 或等价的 runtime 输入。
   - `website-workflow.ts` 优先读取结构化字段，而不是仅从 prompt 文本二次猜测。
3. 兼容要求
   - `visualStyle` 可以暂时保留，作为兼容字段和展示字段。
   - `designTheme` 仅作为历史展示字段存在，不再作为新的表单输入或当前轮主题决策输入。
   - 但 runtime 的最终决策不应只依赖 `visualStyle` 这一串标签。

### 17.8.1 单一主题决策源整合

当前问题不只是“规则不够严谨”，而是同一个主题问题被分散到了三个决策层：

1. 前端推荐层
   - 根据用户输入做启发式推荐。
2. 编排层
   - 把推荐结果、显式选择和表单值转换成 prompt、spec、`workflow_context`。
3. 执行层
   - runtime 再根据 prompt 和技能命中重新推断模板/风格。

长期来看，这种“三层都带一点决策”的结构不合理。建议收敛成“一个决策源，三层复用”：

1. 前端层只负责输入和展示
   - 展示推荐主题。
   - 接收用户显式主主题和辅标签输入。
   - 不承担最终主题决策职责。
2. 编排层成为唯一主题决策源
   - 由 `chat-orchestrator.ts` 统一生成 `primaryVisualDirection`、`secondaryVisualTags`、`visualDecisionSource`、`lockPrimaryVisualDirection`。
   - 这是主题决策的唯一真源。
3. 执行层只消费结构化结果
   - `website-workflow.ts` 优先消费结构化主题决策。
   - 不再把 prompt 文本作为主主题决策真源，也不再从 prompt 反向锁定主主题。
   - `prompt-adaptive` 只作为补充视觉细节的机制，而不是独立主题决策器。

落地原则：

1. 有结构化 `primaryVisualDirection` 时，runtime 不再重新猜主主题。
2. prompt 中的主题描述只作为模型可读解释，不作为控制来源。
3. 执行层只读取 `workflow_context` 中的结构化主题字段，不再从 prompt 反向解析主主题。
4. 兼容层仅保留在历史数据读取与展示侧，不再参与当前轮主题决策。

### 17.9 最小改造范围

只建议改三类内容，保持范围小、风险可控。

1. 主主题字段
   - 在表单状态、规格归一化和 canonical prompt 输入层增加 `primaryVisualDirection`。
   - `visualStyle` 继续保留为兼容数组，但主主题字段成为决策真源。
2. 优先级规则
   - 在 orchestrator 和 runtime 间明确“显式主主题锁定”的规则。
   - 有主主题时，`prompt-adaptive` 只能补充 style preset，不得改主类别。
3. runtime 覆盖策略
   - 在 `website-workflow.ts` 中把 `prompt-adaptive` 的角色从“可能替换主模板”收缩为“补充视觉细节”。
   - 仅当主主题为空时，允许其继续主导模板命中。
4. 默认视觉倾向注入
   - 在 `chat-orchestrator.ts` 中，当 `primaryVisualDirection` 为空且存在推荐结果时，把推荐首选项注入 canonical prompt 或 `workflow_context`。
   - 这一步只增强默认约束，不改变用户交互，不产生额外确认步骤。
5. 决策器整合
   - 把最终主题决策收口到 `chat-orchestrator.ts`。
   - 前端不做最终决策，runtime 不再重复做主主题决策。
   - `website-workflow.ts` 优先消费 `workflow_context` 中的结构化主题字段。
   - `designTheme` 不再参与当前轮主题决策；新输入统一走 `primaryVisualDirection + secondaryVisualTags`。

### 17.10 文档化验收标准

1. 用户显式选择主主题后，多轮生成和微调都保持主主题类别不漂移。
2. `prompt-adaptive` 在有主主题时只补充颜色、字体、语气和密度，不替换主模板类别。
3. 用户未选主主题时，系统可用推荐器或 `prompt-adaptive` 推断默认方向。
4. 同一请求的最终模板来源必须可解释：是用户显式选定、系统推荐默认，还是 runtime 自适应推断。
5. 整个收敛方案不新增确认步骤，不新增中间卡片，不改变当前轻量交互节奏。
