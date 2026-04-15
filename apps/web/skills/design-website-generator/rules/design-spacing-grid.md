# Design Spacing & Grid Rules

## Purpose

规范间距和网格系统，确保布局与 DESIGN.md 一致。

## Rules

### 1. Base Unit System

**规则**: 所有间距必须是 base unit 的倍数（通常是 4px 或 8px）。

```tsx
// ❌ 错误: 非标准间距
<div className="mt-7">Content</div>

// ✅ 正确: 使用 8px 倍数
<div className="mt-8">Content</div>
```

### 2. Spacing Scale Adherence

**规则**: 使用 DESIGN.md 定义的 spacing scale。

| Token | 实际值 | 用途 |
|-------|--------|------|
| space-1 | 4px | 图标与文字间距 |
| space-2 | 8px | 紧凑元素间距 |
| space-4 | 16px | 标准元素间距 |
| space-6 | 24px | 区块内部间距 |
| space-8 | 32px | 区块之间间距 |
| space-12 | 48px | 大区块间距 |
| space-16 | 64px | 页面顶部/底部留白 |

### 3. Component Internal Spacing

**规则**: 组件内部元素间距必须统一。

```tsx
// ✅ 正确: Card 内部统一使用 space-4
<Card>
  <div className="space-y-4">
    <Icon />
    <Title />
    <Description />
  </div>
</Card>
```

### 4. Grid System

**规则**: 页面布局使用 DESIGN.md 指定的网格系统。

| 网格 | 列数 | 用途 |
|------|------|------|
| 12-col | 12 | 标准页面布局 |
| 16-col | 16 | 宽屏页面 |
| 4-col | 4 | 简单列表 |

### 5. Max Width Constraint

**规则**: 内容区域不能超过 DESIGN.md 定义的 maxWidth。

```tsx
// ❌ 错误: 无限宽度
<div className="w-full">Content</div>

// ✅ 正确: 限制最大宽度
<div className="max-w-[1200px] mx-auto">Content</div>
```

### 6. Container Padding

**规则**: 页面容器必须有一致的 horizontal padding。

| 断点 | Padding |
|------|---------|
| Mobile (< 640px) | 16px |
| Tablet (640px - 1024px) | 24px |
| Desktop (> 1024px) | 32px - 64px |

### 7. Section Vertical Rhythm

**规则**: 页面区块之间保持一致的垂直间距。

```tsx
// ✅ 正确: 区块间距为 space-16 (64px)
<section className="py-16">
  <Hero />
</section>
<section className="py-16">
  <Features />
</section>
<section className="py-16">
  <CTA />
</section>
```

## Common Layout Patterns

### Centered Container
```tsx
<div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
  {content}
</div>
```

### Sidebar Layout
```tsx
<div className="flex gap-8">
  <aside className="w-64 shrink-0">Sidebar</aside>
  <main className="flex-1 min-w-0">Main Content</main>
</div>
```

### Grid Layout
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {cards}
</div>
```

## QA Checkpoints

1. 测量区块之间的实际间距，对比规范
2. 验证 max-width 不被超出
3. 检查 responsive padding 是否按断点变化
