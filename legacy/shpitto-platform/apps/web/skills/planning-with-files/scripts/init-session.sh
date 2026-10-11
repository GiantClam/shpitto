#!/bin/bash

# Planning with Files - 会话初始化脚本
# 用法: ./init-session.sh [project-name]

set -e

PROJECT_NAME=${1:-"$(basename $(pwd))"}
TIMESTAMP=$(date +"%Y-%m-%d %H:%M")

echo "🚀 初始化规划会话..."
echo "项目: $PROJECT_NAME"
echo "时间: $TIMESTAMP"

# 创建主目录
PLANNING_DIR=".planning"
mkdir -p "$PLANNING_DIR"

# 初始化 task_plan.md
cat > "$PLANNING_DIR/task_plan.md" << EOF
# Project: $PROJECT_NAME

> 创建时间: $TIMESTAMP
> 最后更新: $TIMESTAMP

## 目标

[在此描述项目要达成的核心目标]

## 成功标准

- [ ] [标准1]
- [ ] [标准2]
- [ ] [标准3]

## 阶段规划

### Phase 1: 初始化
- [ ] 1.1 项目设置和环境配置
- [ ] 1.2 基础架构搭建
- [ ] 1.3 依赖安装和配置

### Phase 2: 核心开发
- [ ] 2.1 核心功能实现
- [ ] 2.2 功能测试
- [ ] 2.3 性能优化

### Phase 3: 完成
- [ ] 3.1 集成测试
- [ ] 3.2 文档完善
- [ ] 3.3 部署准备

## 技术栈

- **前端:** [框架/库]
- **后端:** [框架/语言]
- **数据库:** [数据库类型]

## 约束条件

- 截止日期: [日期]
- 兼容性要求: [描述]

## 验收标准

- [ ] [标准1]
- [ ] [标准2]
EOF

# 初始化 findings.md
cat > "$PLANNING_DIR/findings.md" << EOF
# 研究发现 - $PROJECT_NAME

> 创建时间: $TIMESTAMP

## 研究问题

[在此列出需要研究的问题]

## 背景信息

[收集的相关背景资料]

## 关键发现

### 1. [发现1]
**来源:** [文档/网站/实验]
**可信度:** [高/中/低]

[详细描述]

### 2. [发现2]
**来源:** [文档/网站/实验]
**可信度:** [高/中/低]

[详细描述]

## 决策选项

### 选项 A: [方案名称]
**优点:**
- [优点1]
- [优点2]
**缺点:**
- [缺点1]
- [缺点2]

### 选项 B: [方案名称]
**优点:**
- [优点1]
- [优点2]
**缺点:**
- [缺点1]
- [缺点2]

## 待验证事项

- [ ] [事项1]
- [ ] [事项2]

## 参考资料

1. [标题](链接)
2. [标题](链接)
EOF

# 初始化 progress.md
cat > "$PLANNING_DIR/progress.md" << EOF
# 进度日志 - $PROJECT_NAME

> 会话开始: $TIMESTAMP

## 会话信息

**会话ID:** $(date +%s)
**上下文摘要:** 新会话开始

## 当前状态

**总体进度:** 0/9 任务 (0%)
**当前阶段:** Phase 1 - 初始化
**预计剩余:** 待定

## 已完成任务

暂无

## 当前进行中

暂无

## 错误记录

暂无

## 下一步行动

### 立即执行
- [ ] 阅读 task_plan.md 并完善计划
- [ ] 确认初始任务

### 今天完成
- [ ] 完成项目设置
- [ ] 安装依赖

## 笔记

[额外的想法、观察、想法]

---

*使用 /planning-with-files:status 查看进度*
*使用 /planning-with-files:update 更新状态*
EOF

echo ""
echo "✅ 规划文件已创建:"
echo "   - $PLANNING_DIR/task_plan.md"
echo "   - $PLANNING_DIR/findings.md"
echo "   - $PLANNING_DIR/progress.md"
echo ""
echo "📝 下一步:"
echo "   1. 编辑 task_plan.md 完善计划"
echo "   2. 使用 /planning-with-files 开始工作"
