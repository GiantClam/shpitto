# Command Quick Reference

## Core Commands

### list-design-systems
```bash
list-design-systems [--category <category>]
```
列出所有可用的设计系统。

| 参数 | 类型 | 说明 |
|------|------|------|
| category | string | 可选：ai, developer, infrastructure, fintech, enterprise, consumer, automotive |

**示例**:
```bash
list-design-systems
list-design-systems --category ai
```

---

### recommend-design-system
```bash
recommend-design-system --requirements <描述> [--count <数量>]
```
根据需求获取 AI 推荐。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| requirements | string | 必需 | 网站需求描述 |
| count | number | 5 | 推荐数量 (1-10) |

**示例**:
```bash
recommend-design-system --requirements "Modern AI startup with dark theme" --count 3
```

---

### generate-website
```bash
generate-website --prompt <描述> [--brand <品牌>] [--sections <区块>] [--outputDir <目录>] [--options]
```
生成完整网站。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| prompt | string | 必需 | 网站需求描述 |
| brand | string | - | 设计系统品牌 (如 vercel, claude, stripe) |
| sections | array | ["hero", "features", "cta"] | 页面区块 |
| outputDir | string | "output" | 输出目录 |
| options.skipPreview | boolean | false | 跳过预览 |
| options.skipQA | boolean | false | 跳过 QA 检查 |
| options.includeMagicUI | boolean | true | 包含 Magic UI 动效 |

**示例**:
```bash
generate-website --prompt "AI coding assistant landing page" --brand vercel
generate-website --prompt "SaaS pricing page" --brand stripe --sections ["pricing", "faq"]
generate-website --prompt "Dashboard" --brand linear --options '{"skipQA": true}'
```

---

### generate-page-structure
```bash
generate-page-structure --brand <品牌> [--pageType <类型>] [--requirements <需求>]
```
规划页面结构。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| brand | string | 必需 | 设计系统品牌 |
| pageType | string | "landing" | 页面类型 |
| requirements | string | - | 额外需求描述 |

**pageType 可选值**:
- `landing` - 落地页
- `product` - 产品页
- `pricing` - 定价页
- `about` - 关于页
- `contact` - 联系页

**示例**:
```bash
generate-page-structure --brand claude --pageType landing --requirements "AI assistant with hero, features, testimonials"
```

---

### run-design-qa
```bash
run-design-qa --components <组件数组> --designSystem <品牌>
```
运行设计规范 QA 检查。

| 参数 | 类型 | 说明 |
|------|------|------|
| components | array | 生成的组件代码数组 |
| designSystem | string | 设计系统品牌 |

**示例**:
```bash
run-design-qa --components '["<button>...</button>", "<Card>...</Card>"]' --designSystem vercel
```

---

## Environment Variables

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| LLM_PROVIDER | aiberm | LLM 提供商：aiberm, openrouter, anthropic |
| LLM_MODEL | claude-sonnet-4-20250514 | 使用的模型 |

**设置示例**:
```bash
# 在命令前设置
LLM_PROVIDER=openrouter LLM_MODEL=gpt-4o generate-website --prompt "..."
```

---

## Output Structure

生成的网站文件结构：

```
output/
├── components/
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── Pricing.tsx
│   └── CTA.tsx
├── styles/
│   └── globals.css
├── page.tsx
└── metadata.json
```
