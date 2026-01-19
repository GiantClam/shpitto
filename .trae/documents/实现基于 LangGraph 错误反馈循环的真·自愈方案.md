我完全理解您的需求。您希望在引入“Architect-Critic”多智能体协作的同时，**必须**让用户在前端直观地看到这两个智能体之间的“乒乓球”交互过程（例如：Architect 生成 -> Critic 拒绝并给出意见 -> Architect 修改）。

我将为您实施一个**全栈可视化的多智能体协作方案**。

### 核心目标
1.  **后端架构**：构建真正的 Architect (生成) + Critic (审查) 双智能体循环。
2.  **前端感知**：实时流式传输每个智能体的思考和决策，让用户看到“Critic 正在打回重做”的过程。

---

### 1. 后端架构升级 (Python/LangGraph)

#### A. 引入 Critic Agent
*   **文件**: `apps/backend/agent/architect.py`
*   **新建 `critic_node`**：
    *   **职责**：不再是简单的 Pydantic 校验，而是扮演“审查官”。
    *   **逻辑**：接收 Architect 的 JSON。如果发现错误（Schema 错误或逻辑缺失），它**不会**静默失败，而是生成一条明确的 `HumanMessage`（例如：“*Feedback: The 'Hero' section uses a list for props. Please fix it to use a dict.*”）。
    *   **状态更新**：将 `is_complete` 设为 `False`，并将反馈追加到消息历史。

#### B. 升级 Architect Agent
*   **文件**: `apps/backend/agent/architect.py`
*   **增强 `architect_node`**：
    *   **感知反馈**：如果消息历史中包含 Critic 的反馈，Architect 会将其作为上下文，进行自我修正（Self-Correction）生成。

#### C. 增强流式输出 (SSE)
*   **文件**: `apps/backend/api/chat.py`
*   **逻辑**：监听 LangGraph 的每一个状态跃迁。
    *   当进入 `architect` 节点：推送 `0:"🏗️ Architect is designing the blueprint..."`
    *   当进入 `critic` 节点：推送 `0:"🧐 Critic is reviewing the design..."`
    *   **关键点**：如果 Critic 拒绝了（即循环发生），推送具体的错误反馈，例如：`0:"❌ Critic rejected: Invalid props format. Sending back for revision..."`。这将让用户清晰地看到交互过程。

#### D. 移除静默修复
*   **文件**: `apps/backend/schema/project.py`
*   **操作**: 删除 `fix_props_list`。让错误真实暴露给 Critic，确保系统是靠智能修正而非硬代码修正。

---

### 2. 前端体验升级 (React/Next.js)

#### A. 状态展示组件优化
*   **文件**: `apps/frontend/components/chat-panel.tsx`
*   **操作**：
    *   优化消息解析逻辑，支持显示多行状态更新。
    *   当接收到 `❌ Critic rejected...` 消息时，可以用不同的颜色（如橙色或红色）高亮显示，增强视觉反馈。
    *   最终成功时，显示 `✅ Approved by Critic. Rendering...`。

---

### 预期用户体验 (User Story)
1.  用户输入：“做一个外贸网站。”
2.  聊天框显示：`🏗️ Architect is designing the blueprint...`
3.  （几秒后）聊天框更新：`🧐 Critic is reviewing the design...`
4.  （如果 AI 犯错）聊天框显示：`❌ Critic rejected: Section 'Hero' has invalid props. Requesting revision...`
5.  聊天框再次显示：`🏗️ Architect is fixing the blueprint based on feedback...`
6.  聊天框最后显示：`✅ Approved! Loading preview...`
7.  右侧预览区加载出完美的网页。

这个方案完美满足了您“多智能体交互”、“前端可视化”、“拒绝代码静默修复”的三大核心需求。