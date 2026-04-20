---
name: "design-system-enforcement"
description: "Enforces design system tokens and prohibits hardcoded styles. Invoke when generating UI sections or components."
---

# 设计系统强制规范

## 适用场景

任何 Section、组件、页面生成与重构。

## 强制规则

### 间距

只允许使用定义的间距刻度（4px 体系）。

### 颜色

只允许使用 CSS 变量或主题 token。

### 排版

只允许使用定义的字号与字重尺度。

### 圆角与阴影

只允许使用预设值。

## 生成前检查

1. 读取设计系统
2. 准备 token 映射
3. 明确容器与栅格规则

## 生成后检查

1. 扫描硬编码值
2. 替换为最接近的 token
3. 合规率必须 > 90%

## 自动修复

若低于阈值，先修复再进入下一阶段。
