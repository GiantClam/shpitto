---
name: "design-website-generator"
version: "2.0.0"
author: "shpitto-tools"
license: "MIT"
description: |
  基于 awesome-design-md 的网站生成技能。采用串行页面生成模式，确保设计和内容连贯性。
  
  **核心价值:**
  - SKILL 是定义者（工作流、标准、选择逻辑）
  - TS 是工具（加载器、执行器）
  - 串行页面生成确保设计和内容连贯
  
  **触发条件:**
  - 用户要求创建网站
  - 用户提到参考某网站风格
  - 用户要求使用现成设计系统
---

# Design Website Generator Skill

## Responsibility Boundary (Authoritative)

- This skill is the **execution skill** for website generation (design loading, context building, prompt execution, QA checks).
- It **must not** act as top-level workflow orchestrator when `website-generation-workflow` is active.
- `website-generation-workflow` owns phase orchestration, enrichment, and cross-phase quality gates.
- This skill receives already-scoped tasks and executes them with deterministic tooling.

## Core Philosophy

**SKILL 是定义者，TS 是工具**

| 职责 | SKILL.md | TypeScript Tools |
|------|----------|------------------|
| 工作流定义 | ✅ 完整流程 | ❌ 不实现流程 |
| 选择标准 | ✅ 详细规则 | ❌ 仅为执行 |
| 确认流程 | ✅ 用户交互 | ❌ 不主导 |
| 设计规范 | ✅ rules/ 目录 | ❌ 仅验证 |
| 加载器 | ❌ 文档引用 | ✅ loadDesignSystem() |
| LLM 执行 | ❌ prompt 模板 | ✅ executeLLM() |
| 预览生成 | ❌ 截图标准 | ✅ renderPreview() |

## Sequential Page Generation Workflow

不同于并行生成，本技能采用 **串行页面生成**，确保页面间的设计和内容连贯。

### 核心理念

```
用户需求
    ↓
┌─────────────────────────────────────────────────────────────┐
│  Page 1: 主页 (Hero + 品牌调性)                               │
│  - 建立品牌调性、核心术语、设计 token 使用模式                   │
│  - 输出: page1_context (内容摘要 + 设计应用记录)                │
└─────────────────────────────────────────────────────────────┘
    ↓ 继承 page1_context
┌─────────────────────────────────────────────────────────────┐
│  Page 2: 功能页 (Features)                                  │
│  - 使用 Page 1 的术语和设计模式                               │
│  - 保持视觉一致性                                            │
│  - 输出: page2_context                                       │
└─────────────────────────────────────────────────────────────┘
    ↓ 继承 page2_context
┌─────────────────────────────────────────────────────────────┐
│  Page 3: 定价页 (Pricing)                                   │
│  - 延续术语体系                                              │
│  - 复用 Page 1-2 的设计组件                                  │
│  - 输出: page3_context                                       │
└─────────────────────────────────────────────────────────────┘
    ↓ ...
┌─────────────────────────────────────────────────────────────┐
│  Page N: 最终页                                             │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  全局 QA: 验证页面间一致性                                    │
│  - 术语一致性                                                │
│  - 设计 token 一致性                                          │
│  - 链接可达性                                                │
└─────────────────────────────────────────────────────────────┘
```

### 为什么串行生成？

| 并行生成问题 | 串行生成优势 |
|--------------|--------------|
| 术语不一致（Page 1 用"功能"，Page 2 用"特性"） | Page 2 继承 Page 1 的术语 |
| 设计 token 用法分散 | 统一的设计 token 应用模式 |
| 导航结构冲突 | 基于前页链接结构逐步构建 |
| 返工率高（30%+） | 返工率低（< 20%） |

## Phase 1: Design System Selection

### 1.1 Selection Criteria（SKILL 定义）

**设计系统选择规则**（由 SKILL 定义，TS 仅执行）：

```
选择维度:
├── 1. 行业匹配度
│   ├── AI/ML 产品 → Claude, Cohere, Replicate
│   ├── 开发者工具 → Vercel, Linear, Cursor
│   ├── 金融/区块链 → Coinbase, Kraken, Stripe
│   └── 电商/SaaS → Shopify, Stripe, Notion
│
├── 2. 设计风格
│   ├── 暗色主题 → Claude, Linear, Vercel
│   ├── 亮色主题 → Notion, Figma, Airbnb
│   └── 高对比度 → Apple, Tesla, NVIDIA
│
├── 3. 复杂度适配
│   ├── 简单落地页 → Framer, Webflow
│   ├── 中等企业站 → Vercel, Stripe
│   └── 复杂多页 → Figma, Notion, Linear
│
└── 4. 内容类型
    ├── 文本为主 → Notion, Linear
    ├── 图片为主 → Unsplash, Pinterest
    └── 数据为主 → Stripe, Vercel
```

### 1.2 Selection Workflow

```
Step 1: 分析用户需求
    ├── 提取: 行业、产品类型、目标受众
    ├── 标记: 缺失信息
    └── 输出: requirements_summary

Step 2: 候选列表生成
    ├── 使用 selection-criteria.md 规则
    ├── 按匹配度排序 (top 5)
    └── 输出: candidates[]

Step 3: 用户确认
    ├── 展示: 品牌 + 关键设计特征
    ├── 预览: 颜色/字体/阴影样本
    └── 确认: 用户选择或 SKILL 推荐

Step 4: Design Spec 初始化
    ├── 加载: selected_brand/DESIGN.md
    ├── 解析: colors/typography/shadows/layout
    └── 输出: design_spec (passed to TS tools)
```

### 1.3 TS 工具职责

```typescript
// SKILL 定义规则，TS 仅执行
interface DesignSystemLoader {
  loadDesignSystem(brand: string): Promise<DesignSystem>;  // 加载
  listBrands(category?: string): Promise<BrandInfo[]>;       // 列表
  getDesignSummary(ds: DesignSystem): string;                 // 摘要
}
```

## Phase 2: Design Confirmation

### 2.1 Confirmation Items（8 项）

**必须确认的设计元素**（由 SKILL 定义检查规则）：

| # | 元素 | 检查规则 | TS 验证 |
|---|------|----------|---------|
| 1 | Primary Color | 确认主色值，用于 CTA/按钮 | validateColor(primary) |
| 2 | Accent Color | 确认强调色，用于 hover/链接 | validateColor(accent) |
| 3 | Neutral Palette | 确认背景/边框色 | validateColor(neutral) |
| 4 | Typography | 确认字体家族和层级表 | validateTypography() |
| 5 | Shadow Tokens | 确认 shadow-as-border 技术 | validateShadow() |
| 6 | Spacing Scale | 确认 8px 基准单位 | validateSpacing() |
| 7 | Border Radius | 确认圆角值 | validateBorderRadius() |
| 8 | Component Style | 确认按钮/卡片/输入框样式 | validateComponents() |

### 2.2 Confirmation Workflow

```
Step 1: 展示 Design Spec
    ├── 显示: 8 项元素的实际值
    ├── 对比: 与用户需求的匹配度
    └── 输出: confirmation_status

Step 2: 用户确认/调整
    ├── 确认: 全部通过 → 进入 Phase 3
    ├── 调整: 某些项需要修改 → 记录 overrides
    └── 拒绝: 设计系统不合适 → 返回 Phase 1

Step 3: 生成 Design Context
    ├── 合并: design_spec + overrides
    └── 输出: design_context (TS 工具使用)
```

## Phase 3: Sequential Page Generation

### 3.1 Page Generation Order

**必须按此顺序生成**（确保连贯性）：

| Order | Page Type | Purpose | Context Required |
|-------|-----------|---------|------------------|
| 1 | Homepage | 建立品牌调性 | design_context |
| 2 | Features | 详细内容 | homepage_context |
| 3 | Pricing | 转化 | features_context |
| 4 | About | 信任建立 | pricing_context |
| 5 | Contact | 行动召唤 | all_previous_context |

### 3.2 Page Context Structure

```typescript
// 每个页面生成后输出 context，供下页使用
interface PageContext {
  pageName: string;
  generatedAt: string;
  
  // 内容摘要
  contentSummary: {
    headings: string[];      // 使用的标题术语
    keyTerms: string[];      // 关键术语
    featureList: string[];   // 功能列表
    pricingTiers?: string[]; // 定价层级
  };
  
  // 设计应用记录
  designUsage: {
    colorsUsed: string[];    // 实际使用的颜色
    typographyUsed: string[];// 实际使用的字体
    componentsUsed: string[];// 使用的组件
  };
  
  // 链接结构
  navigation: {
    internalLinks: string[]; // 内链
    sectionRefs: string[];   // 区块引用
  };
}
```

### 3.3 Intra-Page Section Generation

**同一页面内 sections 可以并发**（3 个并发）：

```
Page 1 生成流程:
    ↓
┌─────────────────────────────────────┐
│  Section 1 (Hero) - 串行开始        │
│  - 生成后输出: hero_context          │
└─────────────────────────────────────┘
    ↓ 继承 hero_context
┌─────────────────────────────────────┐
│  Section 2 (Features) - 并发开始     │
│  Section 3 (Testimonials) - 并发     │
│  Section 4 (CTA) - 并发              │
│  (concurrency = 3)                   │
└─────────────────────────────────────┘
    ↓ 合并所有 section contexts
┌─────────────────────────────────────┐
│  Page 1 Context 汇总                 │
└─────────────────────────────────────┘
```

### 3.4 TS 工具职责

```typescript
// SKILL 定义生成逻辑，TS 仅执行
interface PageGenerator {
  generatePage(
    pageOrder: number,
    pageType: string,
    designContext: DesignContext,
    previousPageContext?: PageContext  // 关键：继承前一页
  ): Promise<PageResult>;
  
  generateSection(
    sectionType: string,
    pageContext: PageContext,
    designSpec: DesignSpec
  ): Promise<SectionResult>;
}

interface LLMTool {
  executePrompt(
    prompt: string,
    systemContext: string
  ): Promise<LLMResponse>;
}
```

## Phase 4: Visual QA Gate

### 4.1 QA Checkpoints

**每个页面生成后必须通过 QA**：

| Checkpoint | Timing | TS 验证 | SKILL 标准 |
|------------|--------|---------|------------|
| Color Compliance | 每 section | ✅ | rules/design-color-compliance.md |
| Typography Hierarchy | 每 section | ✅ | rules/design-typography-hierarchy.md |
| Shadow Technique | 每 section | ✅ | rules/design-shadow-technique.md |
| Spacing & Grid | 每 section | ✅ | rules/design-spacing-grid.md |
| Accessibility | 每 section | ✅ | rules/design-accessibility.md |

### 4.2 Page-Level QA

```
每个页面生成后:
    ↓
┌─────────────────────────────────────┐
│  run-design-qa (TS 工具)            │
│  - 验证设计规范符合度                │
│  - 检查 color/typography/shadow     │
└─────────────────────────────────────┘
    ↓
    ├─ 通过 → 记录到 page_context
    └─ 失败 → 返回修复 (最多 2 次)
```

### 4.3 Site-Level QA（最终）

```
所有页面生成后:
    ↓
┌─────────────────────────────────────┐
│  术语一致性检查                       │
│  - Page 1-2-3... 的 heading 对比    │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  链接可达性检查                       │
│  - 所有 internalLinks 验证           │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  视觉一致性检查                       │
│  - 跨页面 design token 使用对比      │
└─────────────────────────────────────┘
```

## Core Principles

1. **SKILL 是定义者** - 工作流、标准、选择逻辑都在 SKILL 中定义
2. **TS 是执行者** - 只提供 loadDesignSystem, executeLLM 等工具函数
3. **串行页面生成** - 每页基于前一页的 context，确保连贯性
4. **设计规范驱动** - rules/ 目录是设计合规性的最终标准
5. **QA Gate 强制** - 每个页面必须通过设计规范检查

## Success Metrics

| Metric | Target | 说明 |
|--------|--------|------|
| Design Compliance | ≥ 90% | QA 检查通过率 |
| Content Coherence | ≥ 95% | 术语跨页面一致性 |
| Revision Rate | < 20% | 需要重大修改的比例 |
| Generation Speed | < 2min/page | 平均每页面生成时间 |

## Design Compliance Rules

生成组件时必须遵循（位于 `rules/` 目录）：

| 规则 | 文件 | 检查项 |
|------|------|--------|
| 颜色合规 | `rules/design-color-compliance.md` | primary/accent/neutral/semantic 颜色 |
| 字体层级 | `rules/design-typography-hierarchy.md` | 字体、字号、粗细、行高、字间距 |
| 阴影技术 | `rules/design-shadow-technique.md` | shadow-as-border 技术 |
| 间距网格 | `rules/design-spacing-grid.md` | 8px 间距系统 + maxWidth |
| 无障碍 | `rules/design-accessibility.md` | WCAG AA 标准 |

## References

| 类型 | 路径 | 说明 |
|------|------|------|
| 工作流详细 | `prompts/sequential-workflow.md` | 串行生成的具体步骤 |
| 选择标准 | `prompts/selection-criteria.md` | 设计系统选择规则 |
| 命令参考 | `references/command-reference.md` | 命令参数 |
| 故障排除 | `references/troubleshooting.md` | 常见问题 |
| 设计系统结构 | `references/design-system-structure.md` | DESIGN.md 详解 |

## Available Design Systems (58+)

| 类别 | 品牌 |
|------|------|
| **AI & ML** | Claude, Cohere, ElevenLabs, Minimax, Mistral AI, Ollama, OpenCode AI, Replicate, RunwayML, Together AI, VoltAgent, x.ai |
| **Developer Tools** | Cursor, Expo, Linear, Lovable, Mintlify, PostHog, Raycast, Resend, Sentry, Supabase, Superhuman, Vercel, Warp, Zapier |
| **Infrastructure** | ClickHouse, Composio, HashiCorp, MongoDB, Sanity, Stripe |
| **Design & Productivity** | Airtable, Cal.com, Clay, Figma, Framer, Intercom, Miro, Notion, Pinterest, Webflow |
| **Fintech** | Coinbase, Kraken, Revolut, Wise |
| **Enterprise** | Airbnb, Apple, IBM, NVIDIA, SpaceX, Spotify, Uber |
| **Automotive** | BMW, Ferrari, Lamborghini, Renault, Tesla |

## Magic UI Components

可选择的动效组件（需在 generation 前确认）：

| 类别 | 组件 |
|------|------|
| **Animation** | AnimatedBeam, Marquee, NumberTicker, TextReveal |
| **Effect** | BorderBeam, GlowCard, GradientText, Particles |
| **Interactive** | Carousel, ComparisonSlider, Magnifier, SceneSwitcher |
| **Layout** | BentoCard, BentoGrid |

---

**最后更新**: 2026-04-08
**版本**: 2.0.0 (重写以 SKILL 为核心)
