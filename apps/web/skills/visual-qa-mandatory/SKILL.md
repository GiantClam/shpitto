---
name: "visual-qa-mandatory"
description: "Requires visual QA checkpoints at key milestones. Invoke when generating multiple sections or full pages."
---

# 视觉 QA 强制规则

## 适用场景

批量生成或完成页面时必须执行。

## QA 节点

- 每 3 个 Section 做一次视觉巡检
- 页面完成后做一次全局巡检

## 检查维度

1. 对齐：栅格、基线、按钮列对齐一致
2. 层级：标题/正文/辅助信息层级清晰
3. 节奏：区块间距有规律，重轻缓急明确
4. 对比：文字与背景对比符合可读性
5. 溢出：图片/文字不截断，不穿透容器
6. 动效：动效轻量、节奏统一、无干扰

## 输出

- 记录问题与修复建议到 progress.md
