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

1. 聚合会话上下文（最近多轮 user/assistant/timeline 摘要）。  
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

### 7.2 多轮聚合规则

1. 读取最近 N 条用户消息 + 最近一次系统提炼草稿。  
2. 槽位按“新消息覆盖旧值”策略更新，并保留证据片段。  
3. 每轮只提示 1-2 个关键缺口。  
4. 达到阈值（如 70%）且无硬阻塞时，可直接 `generate`（含默认值声明）。

### 7.3 输出形式

继续保留时间线可视化卡片（进度/草稿），但不依赖固定动作按钮驱动流程。

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
原因：仓库已落地 LangGraph 依赖与 worker 链路，复用成本最低、验证路径最短；历史记忆需求可通过会话摘要 + 槽位存储 + revision 指针满足。

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
3. 指标化看板（从提问到首预览时延、微调成功率、重生成比例）。

本阶段测试用例（必须新增）：

1. `apps/web/lib/agent/chat-intent-confidence.test.ts`（新增）：覆盖低置信最小追问与不误触发任务。  
2. `apps/web/lib/agent/chat-ux-timeline.test.ts`（新增）：覆盖时间线卡片与阶段提示一致性。  
3. `apps/web/lib/agent/chat-entry-full-flow.test.ts`：扩展到“生成后多轮微调 + 再部署”。

### 12.4 文件级实施任务清单（可直接执行）

1. `apps/web/app/api/chat/route.ts`：实现状态机读取、意图判定路由、多轮需求聚合入口。  
2. `apps/web/lib/agent/chat-task-store.ts`：补齐 `workflow_context` / revision 指针读写与查询接口。  
3. `apps/web/lib/skill-runtime/executor.ts`：新增 refine 执行入口（不改现有 full-generate/deploy 语义）。  
4. `apps/web/scripts/chat-task-worker.ts`：接入 refine 任务类型执行与失败回滚处理。  
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
