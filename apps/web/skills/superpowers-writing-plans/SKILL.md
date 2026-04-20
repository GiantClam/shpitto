---
name: superpowers-writing-plans
description: |
  详细实施计划编写技能，将设计分解为可执行的2-5分钟任务。
  
  **核心功能:**
  - 将复杂任务分解为原子级子任务
  - 每个任务包含精确的文件路径和完整代码
  - 提供验证步骤确保正确实施
  
  **触发条件:**
  - 设计阶段完成后需要实施计划
  - 头脑风暴已确认方向
  
  **激活方式:**
  - 命令: `/superpowers:write-plan`
  - 上下文: 设计确认后自动触发
---

# Superpowers: Writing Plans Skill

## Overview

这是一个详细的实施计划编写技能。它将复杂任务分解为 2-5 分钟可完成的原子级子任务，每个任务都有精确的文件路径、完整代码和验证步骤。

## Core Philosophy

**"清晰到 junior engineer 也能执行"**

- 每个任务应该是自包含的
- 不需要额外思考就能开始工作
- 有明确的完成标准
- 可以独立验证

## Plan Structure

### 顶级结构

```markdown
# 实施计划: [项目名称]

**创建时间:** [timestamp]
**预计总时长:** [时间]
**任务总数:** [N] 个任务

## 概览

### 阶段划分

| 阶段 | 任务数 | 预计时长 | 依赖 |
|------|--------|----------|------|
| Phase 1 | 5 | 25min | 无 |
| Phase 2 | 8 | 40min | Phase 1 |
| Phase 3 | 3 | 15min | Phase 2 |

### 依赖图

```
Phase 1 ──→ Phase 2 ──→ Phase 3
   │           │
   └──→ [独立任务可并行]
```

## 任务列表

### Phase 1: [阶段名称]

#### Task 1.1: [任务标题]
**预计时长:** 3分钟
**优先级:** P0 (必须)
**依赖:** 无

**目标:** [一句话描述]

**详细步骤:**

1. **步骤1** (1分钟)
   - 操作: [具体操作]
   - 文件: `src/file.js`
   - 代码:
     ```javascript
     // 具体代码或操作描述
     ```

2. **步骤2** (2分钟)
   - 操作: [具体操作]
   - 文件: `src/file.js`
   - 代码:
     ```javascript
     // 具体代码或操作描述
     ```

**验证:**
```bash
# 运行验证命令
npm test -- --grep "task-1-1"
```

**完成标准:**
- [ ] 代码已写入文件
- [ ] 测试通过
- [ ] 无 lint 错误

---

#### Task 1.2: [任务标题]
...
```

## Task Writing Guidelines

### 每个任务必须包含

1. **清晰的标题**
   - 格式: `[区域]: [具体操作]`
   - 示例: `auth: 添加用户登录API`

2. **时间估算**
   - 目标: 2-5分钟
   - 诚实估算，不要过于乐观

3. **目标描述**
   - 一句话说清楚要达成什么

4. **详细步骤**
   - 每个步骤有具体操作
   - 包含精确的文件路径
   - 提供完整的代码片段

5. **验证命令**
   - 可运行的测试或检查
   - 明确的通过标准

6. **完成清单**
   - 客观的检查项
   - 易于自检

### 任务粒度控制

**太粗:**
```markdown
- 实现用户认证系统
  - 需要一下午时间
  - 涉及多个文件
```

**太细:**
```markdown
- 创建变量 `const user = null`
  - 耗时: 30秒
```

**刚刚好:**
```markdown
- 添加用户登录API端点
  - 预计: 4分钟
  - 涉及: src/api/auth.js
  - 产出: 50行代码 + 3个测试
```

## Planning Process

### Phase 1: 分析设计文档

```
输入: 经过确认的设计方案

分析:
1. 识别主要模块
2. 确定依赖关系
3. 估算工作量
4. 规划执行顺序
```

### Phase 2: 任务分解

```
对于每个模块:

1. 识别独立功能点
2. 分解为原子任务
3. 估算每个任务时间
4. 标记依赖关系
5. 确定验证方法
```

### Phase 3: 排序和优化

```
排序原则:
1. 依赖在前，被依赖在后
2. 高风险在前，低风险在后
3. 基础设施在前，业务在后
4. 独立任务可以并行

优化:
1. 合并相关小任务
2. 拆分过大的任务
3. 添加检查点
```

### Phase 4: 文档化

```
产出: 完整的任务清单

格式:
1. 概览表
2. 阶段划分
3. 详细任务描述
4. 验证步骤
5. 风险提示
```

## Task Template

```markdown
#### Task [编号]: [任务标题]

**预计时长:** [N]分钟
**优先级:** [P0/P1/P2]
**依赖:** [Task X 或 无]
**类型:** [新增/修改/删除/重构]

**目标:**
[一句话描述要达成的结果]

**背景信息:**
[相关的设计决策或上下文]

**详细步骤:**

##### 步骤1: [步骤标题]
- **操作:** [具体操作]
- **文件:** `path/to/file.ext`
- **代码:**
  ```[语言]
  [完整代码片段]
  ```

##### 步骤2: [步骤标题]
...

**涉及文件:**
- `src/file1.js` - 新增/修改
- `src/file2.js` - 删除
- `tests/file1.test.js` - 新增

**验证:**

```bash
# 命令1
command --args

# 命令2  
command --args
```

**预期输出:**
```
[期望的输出示例]
```

**完成标准:**
- [ ] [检查项1]
- [ ] [检查项2]
- [ ] [检查项3]

**风险和缓解:**
- 风险: [可能的失败点]
- 缓解: [如何避免或处理]
```

## Example Plan

### 示例: 用户认证模块

```markdown
# 实施计划: 用户认证模块

**创建时间:** 2026-01-21 10:00
**预计总时长:** 45分钟
**任务总数:** 12个任务

## 概览

| 阶段 | 任务数 | 时长 |
|------|--------|------|
| Phase 1: 基础设施 | 4 | 15min |
| Phase 2: 核心功能 | 5 | 20min |
| Phase 3: 测试完善 | 3 | 10min |

## Phase 1: 基础设施

#### Task 1.1: 创建认证配置文件
**预计时长:** 3分钟
**优先级:** P0
**依赖:** 无

**目标:** 创建 JWT 配置文件

**详细步骤:**

1. 创建配置目录
   ```bash
   mkdir -p src/config
   ```

2. 创建认证配置
   ```typescript
   // src/config/auth.ts
   export const authConfig = {
     jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
     jwtExpiresIn: '24h',
     bcryptRounds: 10,
   };
   ```

**验证:**
```bash
ls -la src/config/auth.ts
```

**完成标准:**
- [ ] 文件存在
- [ ] 无语法错误
- [ ] 可被导入

---

#### Task 1.2: 创建用户模型
**预计时长:** 5分钟
**优先级:** P0
**依赖:** Task 1.1

**目标:** 定义用户数据模型

**详细步骤:**

1. 创建用户模型
   ```typescript
   // src/models/User.ts
   import mongoose, { Document, Schema } from 'mongoose';
   
   export interface IUser extends Document {
     email: string;
     password: string;
     name: string;
     role: 'user' | 'admin';
     createdAt: Date;
   }
   
   const UserSchema = new Schema<IUser>({
     email: { type: String, required: true, unique: true },
     password: { type: String, required: true },
     name: { type: String, required: true },
     role: { type: String, enum: ['user', 'admin'], default: 'user' },
     createdAt: { type: Date, default: Date.now },
   });
   
   export const User = mongoose.model<IUser>('User', UserSchema);
   ```

2. 创建索引
   ```typescript
   // 在模型文件末尾添加
   UserSchema.index({ email: 1 });
   ```

**验证:**
```bash
npx tsc --noEmit src/models/User.ts
```

**完成标准:**
- [ ] 模型定义正确
- [ ] TypeScript 编译通过
- [ ] 接口定义完整

---

[后续任务...]
```

## Quality Checklist

### 计划质量检查

- [ ] 每个任务都有明确目标
- [ ] 时间估算在 2-5 分钟范围内
- [ ] 任务之间依赖关系清晰
- [ ] 代码片段完整可复制
- [ ] 验证命令可运行
- [ ] 完成标准可客观判断
- [ ] 高风险任务已识别

### 完整性检查

- [ ] 覆盖所有设计需求
- [ ] 包含错误处理
- [ ] 包含测试用例
- [ ] 包含文档更新
- [ ] 包含配置更改

## Output Format

### 计划文档结构

```markdown
# 实施计划: [项目名称]

## 📊 概览
- 总任务数: [N]
- 预计时长: [时间]
- 优先级分布: P0([N]) P1([N]) P2([N])

## 🎯 执行顺序
1. 先做: [Task X, Task Y...]
2. 可并行: [Task A, Task B...]
3. 风险点: [注意什么]

## 任务详情

### Phase 1: [阶段名]
[Task 1.1...]
[Task 1.2...]

### Phase 2: [阶段名]
[Task 2.1...]
[Task 2.2...]

## ✅ 验证清单
- [ ] 所有测试通过
- [ ] 无 lint 错误
- [ ] 类型检查通过
- [ ] 功能测试通过

---

**准备开始执行？**
输入 `/superpowers:execute-plan` 开始执行
```

## Trigger Conditions

### 自动触发
- 设计方案已确认
- `/superpowers:brainstorm` 完成
- 新任务需要详细规划

### 手动触发
- `/superpowers:write-plan` - 开始规划
- `/superpowers:write-plan:add [任务]` - 添加任务
- `/superpowers:write-plan:review` - 审查计划

## Best Practices

### 1. 诚实估算
- 考虑调试时间
- 考虑测试时间
- 考虑上下文切换

### 2. 自包含任务
- 每个任务应该能独立完成
- 不应该需要额外的设计决策
- 应该能在中断后继续

### 3. 可验证结果
- 每个任务有明确的成功标准
- 应该有自动化验证
- 应该有清晰的输出

### 4. 风险意识
- 标记高风险任务
- 提供回退方案
- 包含错误处理

## Integration

### 与 Brainstorming 配合
- 输入: 确认的设计方案
- 输出: 详细的实施计划

### 与 Executing 配合
- 输出: 可执行的任务清单
- 格式: 易于脚本化执行

### 与 Planning with Files 配合
- 自动创建 task_plan.md
- 进度更新到 progress.md
- 发现记录到 findings.md

## Common Patterns

### Pattern 1: Infrastructure First
先搭建基础设施，再实现业务逻辑。

### Pattern 2: API Contract First
先定义接口，再实现内部逻辑。

### Pattern 3: Data Model First
先设计数据模型，再实现操作。

### Pattern 4: Tests First
先写测试，再实现功能（TDD）。

## Success Metrics

- ✅ 计划覆盖率达到 100%
- ✅ 实际执行时间接近估算
- ✅ 任务阻塞率低于 10%
- ✅ 计划变更率低于 20%
