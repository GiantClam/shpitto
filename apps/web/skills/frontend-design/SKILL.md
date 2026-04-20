---
name: frontend-design
description: |
  生成独特的、生产级的前端界面设计，专注于排版、颜色、运动和背景。
  
  **核心原则:**
  - 排版：选择独特有趣的字体，避开通用字体
  - 颜色：使用 CSS 变量保持一致性，主色配锐利强调色
  - 运动：优先使用纯 CSS 动画，关注高影响时刻
  - 背景：使用层叠渐变和几何图案创造氛围
  
  **避免的 AI 美学:**
  - 过度使用的字体（Inter、Roboto、Arial）
  - 陈词滥调的配色（白底紫色渐变）
  - 可预测的布局模式
  
  **激活方式:**
  - 命令: `/design`
  - 命令: `/frontend-design`
  - 上下文: 检测到前端设计需求时自动触发
---

# Frontend Design Skill

## Overview

这是一个生成独特、生产级前端界面设计的技能。专注于创建有品味的设计，避免常见的 AI 生成美学陷阱。

## Design Pillars

### 1. Typography (排版)

**选择原则:**

```css
/* ✅ 好: 独特有趣的字体 */
--font-heading: 'Playfair Display', serif;
--font-body: 'Inter', sans-serif;
--font-accent: 'Space Mono', monospace;

/* ❌ 避免: 过度使用的通用字体 */
--font-body: 'Arial', sans-serif;
--font-heading: 'Roboto', sans-serif;
```

**字体组合示例:**

| 场景 | 标题字体 | 正文字体 | 强调字体 |
|------|----------|----------|----------|
| 现代科技 | Space Grotesk | Inter | JetBrains Mono |
| 优雅商务 | Playfair Display | Source Sans Pro | IBM Plex Mono |
| 创意艺术 | DM Serif Display | Nunito | Fira Code |
| 极简主义 | Helvetica Now | System UI | SF Mono |
| 复古风格 | Abril Fatface | Lato | Roboto Mono |

**字体使用规范:**

```css
/* 层级系统 */
h1 { font-family: var(--font-heading); font-size: 3rem; font-weight: 700; }
h2 { font-family: var(--font-heading); font-size: 2.25rem; font-weight: 600; }
h3 { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 600; }
body { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; }
.caption { font-family: var(--font-accent); font-size: 0.875rem; }
```

### 2. Color & Theme (颜色和主题)

**配色原则:**

```css
/* ✅ 好: 主色配锐利强调色 */
:root {
  --primary: #6366f1;      /* 主色 */
  --primary-foreground: #ffffff;
  
  --accent: #f43f5e;       /* 锐利强调色 */
  --accent-foreground: #ffffff;
  
  --background: #0f172a;   /* 深色背景 */
  --foreground: #f8fafc;
}

/* ❌ 避免: 胆怯、均匀分布的调色板 */
:root {
  --primary: #8b5cf6;
  --secondary: #a78bfa;
  --tertiary: #c4b5fd;
  /* 全部看起来一样 */
}
```

**颜色系统:**

```css
:root {
  /* 主色 - 品牌色 */
  --color-primary: var(--primary);
  --color-primary-light: color-mix(in srgb, var(--primary), white 20%);
  --color-primary-dark: color-mix(in srgb, var(--primary), black 20%);
  
  /* 强调色 - 动作和交互 */
  --color-accent: var(--accent);
  --color-accent-hover: color-mix(in srgb, var(--accent), black 10%);
  
  /* 语义色 */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  
  /* 中性色 */
  --color-surface: var(--background);
  --color-surface-elevated: color-mix(in srgb, var(--background), white 5%);
  --color-border: color-mix(in srgb, var(--foreground), transparent 90%);
}
```

**避免的配色:**

```css
/* ❌ 陈词滥调: 白色背景上的紫色渐变 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* ❌ 过度饱和的彩虹色 */
background: linear-gradient(to right, #ff6b6b, #feca57, #48dbfb, #ff9ff3);

/* ❌ 典型的 AI 蓝色 */
background: linear-gradient(180deg, #1e3a8a 0%, #3b82f6 100%);
```

### 3. Motion (运动)

**动画原则:**

```css
/* ✅ 好: 有目的的动画 */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.element {
  animation: slideIn 0.4s ease-out;
}

/* ❌ 避免: 过度动画 */
.element {
  animation: bounce 1s infinite;
  transform: rotate(360deg) scale(1.1);
  transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

**高影响时刻:**

```css
/* 页面加载 */
.page-enter {
  animation: pageEnter 0.6s ease-out forwards;
}

/* 按钮悬停 */
.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -10px var(--color-primary);
}

/* 成功反馈 */
.success-animation {
  animation: successPop 0.5s ease-out;
}

/* 卡片悬停 */
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px -20px var(--color-primary);
}
```

**纯 CSS 动画库:**

```css
/* 淡入 */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 滑入 */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 缩放 */
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* 脉冲 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 旋转 */
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 4. Background (背景)

**背景原则:**

```css
/* ✅ 好: 层叠渐变创造氛围 */
.hero {
  background: 
    radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(244, 63, 94, 0.1) 0%, transparent 50%),
    linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
}

/* ❌ 避免: 单调或陈词滥调 */
.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

**背景模式:**

```css
/* 网格模式 */
.grid-background {
  background-image: 
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

/* 点阵模式 */
.dot-background {
  background-image: radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* 渐变模式 */
.gradient-mesh {
  background: 
    radial-gradient(at 40% 20%, hsla(28,100%,74%,0.3) 0px, transparent 50%),
    radial-gradient(at 80% 0%, hsla(189,100%,56%,0.2) 0px, transparent 50%),
    radial-gradient(at 0% 50%, hsla(340,100%,76%,0.2) 0px, transparent 50%);
}

/* 噪点纹理 */
.noise-background {
  background: url("data:image/svg+xml,...noise..."),
              linear-gradient(to bottom, #0f172a, #1e293b);
}
```

## Design Patterns

### Card Design

```tsx
// Modern Card Component
export function Card({ children, hover = false }) {
  return (
    <div className={`
      relative overflow-hidden rounded-2xl
      bg-slate-900/50 backdrop-blur-xl
      border border-white/10
      ${hover ? 'transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20' : ''}
    `}>
      {/* 装饰光效 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
      <div className="relative p-6">
        {children}
      </div>
    </div>
  )
}
```

### Button Design

```tsx
// Gradient Border Button
export function GradientButton({ children }) {
  return (
    <button className="
      relative px-6 py-3 rounded-xl
      bg-slate-900
      text-white font-medium
      before:absolute before:inset-0 before:rounded-xl
      before:p-[1px] before:bg-gradient-to-r before:from-indigo-500 before:via-purple-500 before:to-pink-500
      before:-z-10
      hover:scale-105 active:scale-95
      transition-transform duration-200
    ">
      <span className="relative bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
        {children}
      </span>
    </button>
  )
}
```

### Hero Section

```tsx
export function HeroSection() {
  return (
    <section className="
      relative min-h-[80vh] flex items-center justify-center
      overflow-hidden
      bg-slate-950
    ">
      {/* 背景效果 */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>
      
      {/* 内容 */}
      <div className="relative z-10 text-center max-w-4xl px-6">
        <h1 className="
          text-5xl md:text-7xl font-bold
          bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400
          bg-clip-text text-transparent
          mb-6
        ">
          构建卓越的数字体验
        </h1>
        <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
          我们的使命是创造令人惊叹的用户界面，让每一个像素都充满意义。
        </p>
        <div className="flex gap-4 justify-center">
          <GradientButton>开始使用</GradientButton>
          <button className="
            px-6 py-3 rounded-xl
            bg-white/5 border border-white/10
            text-white font-medium
            hover:bg-white/10
            transition-colors
          ">
            了解更多
          </button>
        </div>
      </div>
    </section>
  )
}
```

### Navigation

```tsx
export function Navigation() {
  return (
    <nav className="
      fixed top-0 left-0 right-0 z-50
      backdrop-blur-xl bg-slate-950/80
      border-b border-white/5
    ">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/" className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
            Brand
          </a>
          <div className="hidden md:flex items-center gap-6">
            <NavLink href="/features">功能</NavLink>
            <NavLink href="/pricing">定价</NavLink>
            <NavLink href="/about">关于</NavLink>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-sm text-slate-400 hover:text-white transition-colors">
            登录
          </button>
          <GradientButton>免费试用</GradientButton>
        </div>
      </div>
    </nav>
  )
}
```

## Design System

### Spacing Scale

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;
}
```

### Color Tokens

```css
:root {
  /* 基础颜色 */
  --color-slate-50: #f8fafc;
  --color-slate-100: #f1f5f9;
  --color-slate-200: #e2e8f0;
  --color-slate-300: #cbd5e1;
  --color-slate-400: #94a3b8;
  --color-slate-500: #64748b;
  --color-slate-600: #475569;
  --color-slate-700: #334155;
  --color-slate-800: #1e293b;
  --color-slate-900: #0f172a;
  --color-slate-950: #020617;
  
  /* 主色 */
  --color-indigo-50: #eef2ff;
  --color-indigo-100: #e0e7ff;
  --color-indigo-200: #c7d2fe;
  --color-indigo-300: #a5b4fc;
  --color-indigo-400: #818cf8;
  --color-indigo-500: #6366f1;
  --color-indigo-600: #4f46e5;
  --color-indigo-700: #4338ca;
  --color-indigo-800: #3730a3;
  --color-indigo-900: #312e81;
  --color-indigo-950: #1e1b4b;
}
```

### Shadow System

```css
:root {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --shadow-glow: 0 0 40px -10px rgba(99, 102, 241, 0.4);
}
```

## Best Practices

### 1. 避免 AI 美学陷阱

**字体:**
- ❌ Inter, Roboto, Arial, System UI
- ✅ Playfair Display, Space Grotesk, DM Serif Display

**颜色:**
- ❌ 白底紫色渐变
- ✅ 深色主题配强调色

**布局:**
- ❌ 卡片网格 + 圆角 + 阴影
- ✅ 创意的背景和渐变

**动画:**
- ❌ 过度弹跳和旋转
- ✅ 优雅的淡入和滑入

### 2. 一致性

```css
/* 使用 CSS 变量保持一致性 */
.btn-primary {
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-lg);
}

/* 组件间保持间距 */
.card {
  padding: var(--space-6);
  gap: var(--space-4);
}
```

### 3. 可访问性

```css
/* 确保颜色对比度 */
.text-primary {
  color: var(--color-foreground);
  /* 至少 4.5:1 对比度 */
}

.button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* 支持 prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Output Format

### 设计评审报告

```markdown
## 设计评审报告

**项目:** [项目名称]
**评审时间:** [时间]
**评审人:** AI 设计专家

### 设计评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 排版 | 9/10 | 字体选择独特 |
| 颜色 | 8/10 | 配色方案现代 |
| 运动 | 7/10 | 动画流畅但可简化 |
| 背景 | 9/10 | 渐变效果出色 |
| 一致性 | 8/10 | 组件风格统一 |

### 优点

1. 独特的字体组合增加了品牌辨识度
2. 深色主题配合强调色视觉效果好
3. 背景渐变和光效创造氛围

### 改进建议

1. 减少卡片悬停动画的复杂度
2. 确保移动端响应式布局
3. 添加更多微交互增强用户体验

### 检查清单

- [x] 字体选择独特
- [x] 颜色对比度达标
- [x] 动画性能优化
- [x] 响应式设计
- [x] 可访问性
```

## Command Reference

### 设计命令

```bash
# 生成设计
/design generate --type hero
/design generate --type card
/design generate --type navigation

# 应用主题
/design theme --apply ocean
/design theme --custom --primary "#6366f1"

# 优化现有设计
/design audit
/design optimize

# 响应式检查
/design responsive --breakpoints mobile,tablet,desktop
```

### 设计系统命令

```bash
# 生成设计系统
/design system generate

# 添加组件
/design component add button
/design component add card
/design component add modal

# 导出设计令牌
/design tokens export --format css
/design tokens export --format json
```

## Trigger Conditions

### 自动触发
- 检测到需要前端设计
- 创建新的 UI 组件
- 需要改进现有设计

### 手动触发
- `/design` - 启动设计会话
- `/design:hero` - 生成 Hero 区域
- `/design:component [组件名]` - 生成组件
- `/design:audit` - 审计现有设计

## Integration

### 与 Web Artifacts Builder 配合
- 为 artifact 提供设计指导
- 优化组件视觉效果

### 与 Theme Factory 配合
- 使用主题生成颜色方案
- 保持设计一致性

### 与 Planning with Files 配合
- 设计决策记录到 findings.md
- 设计进度更新到 progress.md

## Success Metrics

- ✅ 设计独特性 > 80%
- ✅ 用户满意度 > 90%
- ✅ 性能指标达标
- ✅ 可访问性合规
- ✅ 响应式兼容完整
