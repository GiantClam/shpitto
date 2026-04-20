---
name: "section-quality-checklist"
description: "Defines a mandatory quality checklist for each section. Invoke after generating any section."
---

# 区块质量检查清单

## 适用场景

每次生成 Section 后立即执行。

## 必查项

1. 结构：标题、描述、主操作、次操作是否齐全
2. 文案：标题聚焦收益，正文清晰，无术语堆砌
3. 设计系统：颜色/间距/圆角/阴影均来自 tokens
4. 交互：按钮状态完整（默认/悬停/禁用/加载）
5. 可达性：对比度、语义标签、可聚焦顺序正确
6. 响应式：移动端无溢出，栅格合理折叠

## 记录

- 在 progress.md 中记录通过/不通过与修复项
