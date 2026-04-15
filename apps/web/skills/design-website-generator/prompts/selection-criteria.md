# Design System Selection Criteria

本文档定义设计系统选择的详细规则和决策树。

## Selection Process Overview

```
用户需求
    ↓
┌─────────────────────────────┐
│  Step 1: Requirements       │
│  Analysis                   │
│  - 提取关键信息              │
│  - 标记缺失项                │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  Step 2: Candidate          │
│  Generation                 │
│  - 按规则匹配候选             │
│  - 生成 top 5 列表           │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  Step 3: Ranking            │
│  - 按匹配度排序              │
│  - 计算得分                  │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  Step 4: User               │
│  Confirmation               │
│  - 展示候选                  │
│  - 用户选择或调整            │
└─────────────────────────────┘
```

## Step 1: Requirements Analysis

### 信息提取矩阵

| 维度 | 提取内容 | 缺失时 |
|------|----------|--------|
| 行业 | AI/金融/电商/企业等 | 询问或推断 |
| 产品类型 | SaaS/工具/社交/电商等 | 询问或推断 |
| 目标受众 | 开发者/企业/消费者等 | 推断 |
| 设计风格 | 暗色/亮色/简约/丰富等 | 使用默认 |
| 复杂度 | 简单落地/多页/复杂交互 | 使用简单 |

### 分析 Prompt 模板

```markdown
分析以下网站需求，提取关键信息：

需求: {user_prompt}

提取以下信息:
1. 行业领域 (industry)
2. 产品类型 (product_type)
3. 目标受众 (target_audience)
4. 设计风格偏好 (style_preference)
5. 页面复杂度 (complexity)
6. 特殊要求 (special_requirements)

如果某些信息缺失，标记为 [INFERRED: xxx] 并说明推断理由。

输出格式:
{
  "industry": "...",
  "product_type": "...",
  "target_audience": "...",
  "style_preference": "...",
  "complexity": "simple|medium|complex",
  "special_requirements": [...],
  "confidence": 0.0-1.0
}
```

## Step 2: Candidate Generation

### 匹配维度权重

| 维度 | 权重 | 说明 |
|------|------|------|
| 行业匹配 | 30% | 产品领域对应 |
| 风格匹配 | 25% | 暗色/亮色/简约等 |
| 复杂度匹配 | 20% | 页面数量/交互复杂度 |
| 受众匹配 | 15% | 开发者/企业/消费者 |
| 特殊需求 | 10% | 特定功能需求 |

### 行业 → 品牌映射

```markdown
# 行业匹配表 (权重 30%)

AI / ML 产品:
  - Claude (首选 - AI 原生设计)
  - Cohere
  - Replicate
  - Mistral AI
  - Minimax
  
开发者工具:
  - Vercel (首选 - 开发者首选)
  - Linear (首选 - 项目管理)
  - Cursor
  - Raycast
  - Warp
  
金融 / 区块链:
  - Stripe (首选 - SaaS 支付)
  - Coinbase
  - Kraken
  
电商 / 零售:
  - Shopify
  - Notion (简洁展示)
  
企业 / SaaS:
  - Notion (首选 - 文档风格)
  - Figma
  - Linear
  - Intercom
  
社交 / 内容:
  - Pinterest
  - Webflow
  - Framer
  
汽车 / 高端:
  - Tesla (首选 - 简洁高科技)
  - BMW
  - Ferrari
```

### 风格 → 品牌映射

```markdown
# 风格匹配表 (权重 25%)

暗色主题 (Dark Mode):
  - Vercel (经典暗色)
  - Linear (暗色 + 渐变)
  - Claude (AI 风格)
  - Raycast (开发者工具)
  - MongoDB
  - Sentry
  
亮色主题 (Light Mode):
  - Notion (简洁白)
  - Figma (创意工具)
  - Airbnb (温暖亮色)
  - Pinterest (图片为主)
  
高对比度:
  - Apple (极致简洁)
  - Tesla (高科技感)
  - NVIDIA (数据可视化)
  
多彩 / 渐变:
  - Stripe (蓝色渐变)
  - Instagram (多彩)
  - Replicate (AI 风格)
```

### 复杂度 → 品牌映射

```markdown
# 复杂度匹配表 (权重 20%)

简单落地页 (1-3 页):
  - Framer (快速落地)
  - Webflow
  - Notion (文档风格)
  
中等复杂度 (4-8 页):
  - Vercel
  - Stripe
  - Linear
  
复杂多页 (10+ 页):
  - Figma (设计系统完整)
  - Notion (信息架构清晰)
  - Linear (功能丰富)
```

## Step 3: Ranking

### 评分算法

```typescript
function calculateMatchScore(
  requirements: UserRequirements,
  brand: BrandInfo,
  designSystem: DesignSystem
): number {
  let score = 0;
  
  // 行业匹配 (30%)
  const industryScore = getIndustryScore(requirements.industry, brand.category);
  score += industryScore * 0.30;
  
  // 风格匹配 (25%)
  const styleScore = getStyleScore(requirements.stylePreference, designSystem);
  score += styleScore * 0.25;
  
  // 复杂度匹配 (20%)
  const complexityScore = getComplexityScore(requirements.complexity, brand);
  score += complexityScore * 0.20;
  
  // 受众匹配 (15%)
  const audienceScore = getAudienceScore(requirements.targetAudience, brand);
  score += audienceScore * 0.15;
  
  // 特殊需求 (10%)
  const specialScore = getSpecialScore(requirements.specialRequirements, designSystem);
  score += specialScore * 0.10;
  
  return score; // 0-100
}

function getIndustryScore(industry: string, brandCategory: string): number {
  const industryMap: Record<string, string[]> = {
    'ai': ['ai', 'developer'],
    'developer': ['developer', 'infrastructure'],
    'fintech': ['fintech', 'infrastructure'],
    'ecommerce': ['consumer', 'enterprise'],
    'enterprise': ['enterprise', 'infrastructure'],
  };
  
  const expected = industryMap[industry] || ['other'];
  return expected.includes(brandCategory) ? 100 : 50;
}
```

### 排名输出格式

```markdown
## 设计系统推荐 (Top 5)

根据您的需求，最匹配的 5 个设计系统：

| 排名 | 品牌 | 得分 | 匹配原因 |
|------|------|------|----------|
| 1 | vercel | 85/100 | 开发者工具 + 暗色主题 + 中等复杂度 |
| 2 | linear | 78/100 | 开发者工具 + 项目管理 + 暗色主题 |
| 3 | claude | 72/100 | AI 产品 + 暗色主题 |
| 4 | raycast | 68/100 | 开发者工具 + macOS 风格 |
| 5 | mintlify | 61/100 | 文档风格 + 开发者工具 |

### 推荐理由

**Vercel (得分 85)**
- ✅ 行业匹配: 开发者工具类型完全匹配
- ✅ 风格匹配: 经典暗色主题符合您的偏好
- ✅ 复杂度匹配: 适合 5-7 页企业站
- ⚠️ 注意: Vercel 设计偏向极简，如需丰富内容可能需要调整

### 设计预览

Vercel 设计系统特点:
- Primary: #000000 (黑)
- Accent: #0070f3 (蓝)
- 字体: Geist
- 阴影: shadow-as-border
```

## Step 4: User Confirmation

### 展示内容

```markdown
## 确认设计系统: {brand_name}

### 1. 设计预览

**颜色系统**
- Primary: {primary_color}
- Accent: {accent_color}
- Neutral: {neutral_colors}

**字体系统**
- 标题: {heading_font}
- 正文: {body_font}

**阴影技术**
- 使用 shadow-as-border (细线边框效果)

### 2. 匹配度说明

| 维度 | 匹配度 | 说明 |
|------|--------|------|
| 您的需求 | 85% | ... |

### 3. 确认问题

请确认:
1. 这个设计系统是否符合您的预期？
2. 需要调整任何设计元素吗？
3. 确认后我们将进入页面生成阶段

[确认使用此设计系统] [选择其他] [调整设计元素]
```

### 用户选择处理

```
用户选择 "确认" → 进入 Phase 3
用户选择 "其他" → 返回 Step 2，展示新候选
用户选择 "调整" → 进入 Design Override 流程
```

## Design Override 流程

如果用户需要调整某些设计元素：

```markdown
## 设计元素调整

当前设计: {brand_name}

可调整的元素:
1. Primary Color → 选择或输入颜色
2. Accent Color → 选择或输入颜色
3. 字体 → 从预设列表选择
4. 阴影强度 → light / medium / strong

调整后，系统会生成 override spec，
但仍使用原始设计系统的基础框架。

调整记录将保存到 design_spec.overrides
```

## 快速选择规则 (LLM 决策)

当用户明确指定时：

| 用户输入 | 自动选择 | 置信度 |
|----------|----------|--------|
| "像 Vercel 那样" | Vercel | 高 |
| "开发者文档风格" | Mintlify | 高 |
| "Stripe 的支付风格" | Stripe | 高 |
| "Claude AI 的感觉" | Claude | 高 |
| "Notion 一样简洁" | Notion | 高 |
| "暗色主题" | Linear | 中 |
| "苹果风格" | Apple | 中 |

## 匹配度阈值

```typescript
const MATCH_THRESHOLDS = {
  EXCELLENT: 85,  // >= 85: 直接推荐
  GOOD: 70,       // 70-84: 推荐备选
  FAIR: 50,       // 50-69: 需要用户确认
  POOR: < 50      // < 50: 建议重新分析需求
};
```
