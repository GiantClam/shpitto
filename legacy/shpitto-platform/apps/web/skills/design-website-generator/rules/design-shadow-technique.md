# Design Shadow Technique Rules

## Purpose

规范阴影的使用方式，确保组件层次感与原始设计一致。

## Core Concept: Shadow-as-Border

awesome-design-md 使用 **shadow-as-border** 技术：
- 用 `box-shadow` 代替 `border` 来创建细线效果
- 阴影既提供层次感，又提供边界分隔

## Rules

### 1. Shadow Token Usage

**规则**: 必须使用 DESIGN.md 中定义的 shadow tokens，禁止硬编码阴影。

```tsx
// ❌ 错误: 硬编码阴影
<div className="shadow-md">Card</div>

// ✅ 正确: 使用设计系统阴影
<div className="shadow-border">Card</div>
// 或
<div style={{ boxShadow: designSystem.shadows['shadow-border'] }}>Card</div>
```

### 2. Shadow Scale

**规则**: 遵循设计系统的阴影层级。

| 层级 | 用途 | 示例 |
|------|------|------|
| shadow-border | 卡片边框替代 | 按钮、输入框、卡片 |
| shadow-sm | 轻微提升 | 悬浮状态 |
| shadow-md | 中等提升 | Dropdown、Popover |
| shadow-lg | 强提升 | Modal、Dialog |
| shadow-glow | 发光效果 | Focus 状态、CTA |

### 3. Depth Consistency

**规则**: 同一层级的元素必须使用相同强度的阴影。

```tsx
// ❌ 错误: 同一卡片列表使用不同阴影
<Card shadow="shadow-sm" />
<Card shadow="shadow-md" />
<Card shadow="shadow-lg" />

// ✅ 正确: 统一阴影层级
<Card shadow="shadow-border" />
<Card shadow="shadow-border" />
<Card shadow="shadow-border" />
```

### 4. Interactive Shadow States

**规则**: 交互状态（hover、active）使用对应的阴影变体。

| 状态 | 阴影策略 |
|------|----------|
| Default | shadow-border |
| Hover | shadow-border + shadow-sm |
| Active | shadow-border (insets) |
| Focus | shadow-glow 或 outline |

```tsx
// ✅ 正确的交互状态
<button 
  className="shadow-border hover:shadow-border hover:shadow-sm"
>
  Button
</button>
```

### 5. No Conflicting Border + Shadow

**规则**: 使用 shadow-as-border 时，禁止同时使用 border。

```tsx
// ❌ 错误: 双重边界
<div className="border shadow-border">Card</div>

// ✅ 正确: 只用阴影
<div className="shadow-border">Card</div>
```

## Common Shadow Patterns

### Card Shadow
```css
.shadow-border {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
}
```

### Elevated Card
```css
.shadow-sm {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
```

### Modal/Dialog
```css
.shadow-lg {
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
```

### Glow Effect
```css
.shadow-glow {
  box-shadow: 0 0 20px rgba(var(--color-primary), 0.4);
}
```

## QA Checkpoints

1. 截图对比同一层级元素阴影是否一致
2. 检查 hover/focus 状态阴影是否正确切换
3. 验证没有同时使用 border + shadow
