---
name: planning-with-files
description: |
  实现 Manus-style 的持久化 markdown 规划工作流。
  
  **核心原理:**
  - Context Window = RAM (volatile, limited)
  - Filesystem = Disk (persistent, unlimited)
  - 任何重要信息都要写入磁盘，而非塞入 context
  
  **3文件模式:**
  - task_plan.md - 跟踪阶段和进度
  - findings.md - 存储研究和发现
  - progress.md - 会话日志和测试结果
  
  **触发条件:**
  - 多步骤任务（3+步骤）
  - 研究任务
  - 构建/创建项目
  - 跨越许多工具调用的复杂任务
  
  **激活方式:**
  - 命令: `/planning-with-files`
  - 上下文: 检测到复杂任务规划需求时自动激活
---

# Planning with Files Skill

## Overview

本技能实现 Manus-style 的持久化 markdown 规划工作流，这是价值 $2B 的 AI 公司Manus的核心方法论。

**核心原则:**
> "Markdown 是我在磁盘上的'工作内存'。由于我迭代处理信息且活跃 context 有上限，Markdown 文件作为便签、检查点、构建块服务于笔记、进度追踪和最终交付物。"

## The 3-File Pattern

对于每个复杂任务，创建并维护三个核心文件：

### 1. task_plan.md - 任务规划
```markdown
# Project: [项目名称]

## 目标
[描述项目要达成的目标]

## 阶段规划
- [ ] Phase 1: [阶段名称]
  - [ ] 任务1.1
  - [ ] 任务1.2
- [ ] Phase 2: [阶段名称]
  - [ ] 任务2.1
  - [ ] 任务2.2
- [ ] Phase 3: [阶段名称]

## 约束条件
- 技术约束
- 时间约束
- 资源约束

## 验收标准
- [ ] 标准1
- [ ] 标准2
```

### 2. findings.md - 研究发现
```markdown
# 研究发现 - [主题]

## 背景信息
[收集的相关信息]

## 关键发现
1. 发现1
2. 发现2
3. 发现3

## 决策依据
- 选项A: [优缺点]
- 选项B: [优缺点]
- 最终选择: [理由]

## 待验证事项
- [ ] 事项1
- [ ] 事项2
```

### 3. progress.md - 进度日志
```markdown
# 开发进度 - [日期]

## 会话开始
时间: [timestamp]
上下文摘要: [上次的进度]

## 已完成任务
- [x] 任务1 (时间戳)
- [x] 任务2 (时间戳)

## 当前进行中
- 任务3: [状态]

## 错误记录
### 错误1
- 时间: [timestamp]
- 问题: [描述]
- 解决方案: [如何修复]
- 教训: [避免重复]

## 下一步
- [ ] 任务4
- [ ] 任务5
```

## Key Rules

### 1. 创建计划首先
**永远不要在没有 `task_plan.md` 的情况下开始复杂任务。**

### 2. 2-Action Rule
每 2 次 view/browser 操作后，将发现保存到 `findings.md`。

### 3. 记录所有错误
每次错误都要记录在 `progress.md` 中，帮助避免重复错误。

### 4. 永远不重复失败
跟踪尝试，记录什么方法不起作用，改变方法。

## 工作流程

### Phase 1: 启动
```
当用户描述复杂任务时:
1. 解析任务需求
2. 创建 task_plan.md
3. 创建 findings.md
4. 创建 progress.md
5. 显示计划给用户确认
```

### Phase 2: 执行
```
在每个工具调用前:
1. 重读 task_plan.md
2. 确认当前任务在计划中
3. 执行工具调用

每2次操作后:
1. 更新 progress.md
2. 保存重要发现到 findings.md
```

### Phase 3: 恢复
```
当检测到上下文可能丢失时:
1. 检查 progress.md 的最后状态
2. 提取自上次更新后的会话
3. 显示catchup报告
4. 同步计划文件
```

### Phase 4: 完成
```
当所有任务完成时:
1. 验证所有阶段标记为完成
2. 汇总 findings.md 的关键发现
3. 生成最终报告
4. 清理临时文件

验证清单:
- [ ] 所有阶段完成
- [ ] 测试通过
- [ ] 文档完整
- [ ] 代码审查完成
```

## 会话恢复机制

当上下文窗口填满并使用 `/clear` 后，本技能自动恢复工作：

### 恢复流程
1. 检查 `~/.claude/projects/` 中的会话数据
2. 查找计划文件最后更新时间
3. 提取可能丢失的对话内容
4. 显示 catchup 报告供用户同步

### 最佳实践
1. **禁用自动压缩**: 在设置中关闭 `auto-compact`
2. **使用完整 context**: 最大化 context 利用
3. **定期同步**: 在 context 满前手动更新计划文件
4. **恢复后检查**: 运行 `/planning-with-files` 确认状态

## 触发条件

### 自动触发
- 用户开始复杂的多步骤任务
- 检测到研究或探索性工作需求
- 上下文窗口接近满载
- 长时间会话后的第一次操作

### 手动触发
- `/planning-with-files` - 启动规划会话
- `/planning-with-files:recover` - 恢复会话
- `/planning-with-files:status` - 查看当前进度
- `/planning-with-files:update` - 强制更新计划文件

## 文件位置

```
项目根目录/
├── task_plan.md      # 任务规划（必需）
├── findings.md       # 研究发现（必需）
└── progress.md       # 进度日志（必需）

或使用模板目录:
├── .planning/
│   ├── task_plan.md
│   ├── findings.md
│   └── progress.md
```

## 最佳实践

### 1. 命名约定
- 使用描述性文件名
- 在文件中包含项目标识
- 版本号用于重大更新

### 2. 定期更新
- 每完成一个子任务更新 progress.md
- 每发现关键信息更新 findings.md
- 计划变更时更新 task_plan.md

### 3. 提交版本控制
- 将计划文件纳入 Git
- 定期提交进度更新
- 使用有意义的提交信息

### 4. 团队协作
- 共享 task_plan.md
- 定期同步 findings.md
- 公开 progress.md 供团队查看

## 输出示例

### 启动新项目
```markdown
## 规划会话启动

**项目:** Web应用开发
**时间:** 2026-01-21 10:30

### 已创建文件:
- ✅ task_plan.md
- ✅ findings.md  
- ✅ progress.md

### 下一步:
请审阅 task_plan.md 并确认或修改计划。
确认后输入 "开始执行" 或 "/planning-with-files:execute"
```

### 进度更新
```markdown
## 进度更新

**当前阶段:** Phase 2 - 后端API开发
**完成率:** 3/8 任务 (37.5%)

### 已完成:
- [x] 数据库设计 (10:15)
- [x] 用户认证模块 (10:42)
- [x] 基础API框架 (11:05)

### 进行中:
- 用户API端点: 75% 完成

### 错误记录:
- 11:02 - 数据库连接池配置错误 → 已修复
- 11:18 - JWT token过期问题 → 已修复

### 下一步:
- 完成用户API端点
- 开始订单模块
```

## 与其他 Skills 集成

### 配合 Superpowers
- 使用 `superpowers:brainstorming` 进行设计阶段
- 使用 `superpowers:writing-plans` 分解任务
- 使用 `planning-with-files` 维护持久状态

### 配合 Code Review
- 阶段完成后自动触发代码审查
- 审查结果记录到 findings.md
- 问题修复后更新 progress.md

## 故障排除

### 问题: 计划文件未自动创建
**解决方案:** 手动运行 `/planning-with-files` 或检查文件权限

### 问题: 会话恢复失败
**解决方案:** 
1. 检查 ~/.claude/projects/ 目录存在
2. 验证计划文件未损坏
3. 手动重建缺失的信息

### 问题: 上下文仍然溢出
**解决方案:**
1. 增加保存频率
2. 减少单次任务规模
3. 使用更详细的 findings.md 减少 context 需求

## 配置选项

```json
{
  "planning-with-files": {
    "autoCreate": true,
    "autoUpdate": true,
    "sessionRecovery": true,
    "templateDir": ".planning",
    "updateFrequency": "2-actions"
  }
}
```

## 成功指标

- ✅ 任务完成率提升
- ✅ 上下文丢失减少
- ✅ 错误重复率降低
- ✅ 团队协作效率提升
