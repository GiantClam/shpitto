# Design Accessibility Rules

## Purpose

确保生成的组件符合 WCAG 2.1 AA 标准的无障碍要求。

## Rules

### 1. Color Contrast

**规则**: 所有文本与背景的对比度必须满足 WCAG AA 标准。

| 文本类型 | 最小对比度 |
|----------|------------|
| Normal text (< 18px) | 4.5:1 |
| Large text (≥ 18px bold) | 3:1 |
| UI components (边界) | 3:1 |

```tsx
// ❌ 错误: 对比度不足
<span className="text-gray-400 bg-gray-200">Low Contrast</span>

// ✅ 正确: 对比度达标
<span className="text-gray-600 bg-gray-100">Good Contrast</span>
```

### 2. Focus Visibility

**规则**: 所有交互元素必须有可见的 focus 状态。

```tsx
// ❌ 错误: 默认 outline 被移除
<button className="focus:outline-none">Submit</button>

// ✅ 正确: 提供自定义 focus 样式
<button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
  Submit
</button>
```

### 3. Touch Target Size

**规则**: 移动端可点击元素的最小尺寸为 44x44px。

```tsx
// ❌ 错误: 触摸目标过小
<button className="w-6 h-6">×</button>

// ✅ 正确: 触摸目标 ≥ 44px
<button className="w-11 h-11 min-w-[44px] min-h-[44px]">×</button>
```

### 4. Semantic HTML

**规则**: 使用语义化 HTML 元素。

| 元素 | 用途 |
|------|------|
| `<header>` | 页面或区块头部 |
| `<nav>` | 导航区域 |
| `<main>` | 主内容区 |
| `<section>` | 区块 |
| `<article>` | 文章/卡片内容 |
| `<aside>` | 侧边栏 |
| `<footer>` | 页面或区块底部 |

```tsx
// ❌ 错误: 滥用 div
<div className="text-xl font-bold">Title</div>
<div onClick={handleClick}>Click me</div>

// ✅ 正确: 语义化标签
<h2 className="text-xl font-bold">Title</h2>
<button onClick={handleClick}>Click me</button>
```

### 5. ARIA Labels

**规则**: 图标按钮和装饰性元素必须提供 aria-label。

```tsx
// ❌ 错误: 图标按钮缺少标签
<button>
  <svg>icon</svg>
</button>

// ✅ 正确: 提供 aria-label
<button aria-label="Close dialog">
  <svg aria-hidden="true">icon</svg>
</button>
```

### 6. Keyboard Navigation

**规则**: 交互组件必须支持键盘操作。

| 组件 | 键盘行为 |
|------|----------|
| Button | Enter/Space 触发 |
| Link | Enter 触发 |
| Dropdown | Escape 关闭，Arrow 导航 |
| Modal | Escape 关闭，Tab 循环 |
| Carousel | Arrow 左右切换 |

### 7. Reduced Motion

**规则**: 动画必须尊重用户的 `prefers-reduced-motion` 设置。

```tsx
// ✅ 正确: 使用 media query 禁用动画
@media (prefers-reduced-motion: reduce) {
  .animate-marquee {
    animation: none;
  }
}
```

## Accessibility Checklist

- [ ] 所有文本对比度 ≥ 4.5:1
- [ ] Focus 状态可见
- [ ] 触摸目标 ≥ 44px
- [ ] 使用语义化 HTML
- [ ] 图标按钮有 aria-label
- [ ] 支持键盘导航
- [ ] 动画可被禁用

## QA Checkpoints

1. 使用 Lighthouse Accessibility 检查
2. 手动 Tab 键导航测试
3. 使用 axe-core 自动化检测
