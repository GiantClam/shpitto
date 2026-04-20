---
name: "responsive-by-default"
description: "Forces responsive checks across breakpoints and prevents fixed layouts. Invoke when building UI layout."
---

# 默认响应式

## 适用场景

生成布局与组件结构时必须启用响应式约束。

## 强制规则

- 必须覆盖 320 / 768 / 1440 断点的布局逻辑
- 禁止硬编码容器宽度，使用相对单位或栅格
- 文字与按钮在小屏不溢出、不遮挡、不截断
- 媒体元素保持自适应比例与可视区安全

## 检查清单

1. 栅格在小屏合并列数
2. 间距与字号可缩放
3. 关键交互在移动端可达
4. 不存在横向滚动条

## 禁止事项

- 固定宽高导致裁切
- 只适配桌面尺寸
