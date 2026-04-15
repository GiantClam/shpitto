# Sequential Page Generation Workflow

本文档详细定义串行页面生成的具体步骤和 prompt 模板。

## 核心概念

### 为什么需要串行？

1. **内容连贯性**: 术语、表述方式在页面间保持一致
2. **设计一致性**: 设计 token 的应用模式统一
3. **导航合理性**: 基于已完成页面构建链接结构

### 串行 vs 并行

| 模式 | 适用场景 | 风险 |
|------|----------|------|
| **串行** (本技能) | 多页面网站、连贯内容 | 生成速度稍慢 |
| **并行** | 独立页面、无内容关联 | 术语不一致风险 |

## Page Generation Workflow

### Step 1: 初始化 (Page 1 only)

```
输入:
  - 用户需求 (prompt)
  - 设计系统 (design_spec)
  - 设计确认结果 (confirmed_items)

输出:
  - page1_context
  - first_page_generated = true
```

**LLM Prompt 模板**:

```markdown
你是网站页面生成专家。基于以下信息生成首页。

## 用户需求
{prompt}

## 设计系统
- 品牌: {brand_name}
- Primary Color: {primary_color}
- Accent Color: {accent_color}
- 字体: {font_family}
- 阴影技术: shadow-as-border

## 设计规范
{design_rules_summary}

## 要求
1. 使用提供的设计系统，精确匹配颜色、字体、阴影
2. 页面类型: Homepage (Hero + 主要内容)
3. 建立品牌调性，为后续页面奠定基础
4. 输出完整的 React 组件代码
5. 页面内 sections 可以并发生成，但保持单一 Hero 的核心地位

## 输出格式
1. page_context: {headings, key_terms, design_usage}
2. component_code: 完整的 TSX 代码
3. preview_requirements: 截图需要的元素列表
```

### Step 2: 继承生成 (Page 2+)

```
输入:
  - 用户需求 (original_prompt)
  - 设计系统 (design_spec)
  - 前一页 context (previous_page_context)

输出:
  - pageN_context
  - updated_context_chain
```

**LLM Prompt 模板**:

```markdown
你是网站页面生成专家。基于前一页的内容生成当前页面。

## 用户原始需求
{prompt}

## 前一页 Context
前一页已生成，以下是该页的关键信息：
- 使用的标题: {previous_headings}
- 关键术语: {previous_key_terms}
- 设计 token 使用: {previous_design_usage}
- 内链结构: {previous_links}

## 设计系统
- 品牌: {brand_name}
- Primary Color: {primary_color}
- 字体: {font_family}

## 继承规则 (必须遵守)
1. 术语继承: 如果前一页用"功能特性"，本页也用"功能特性"，不要用同义的其他词
2. 设计继承: 使用与前一页相同的设计 token 应用模式
3. 风格一致: 保持与前一页完全一致的视觉风格

## 本页要求
页面类型: {page_type}
在继承的基础上生成本页内容。

## 输出格式
1. page_context: {headings, key_terms, design_usage} - 继承 + 新增
2. component_code: 完整的 TSX 代码
3. coherence_check: 验证与前一页的一致性
```

### Step 3: Section 内部并发

同一页面内的 sections 可以并发生成（concurrency=3）：

```
Page N 生成:
    │
    ├── Section A (e.g., Features Grid)
    │       ↓
    │   独立 LLM 调用
    │
    ├── Section B (e.g., Testimonials)
    │       ↓
    │   独立 LLM 调用
    │
    └── Section C (e.g., CTA)
            ↓
        独立 LLM 调用

所有 section 完成后 → 汇总到 pageN_context
```

**Section 生成 Prompt**:

```markdown
你是 section 组件生成专家。

## 页面 Context
当前页面的整体 context:
{page_context}

## 设计系统
- Primary: {primary_color}
- 字体: {font_family}
- 阴影: {shadow_tokens}

## Section 类型
{section_type}

## Section 特定 Prompt
{section_specific_requirements}

## 设计规范
{design_rules}

## 输出
- component_code: TSX 代码
- element_list: 页面元素列表 (用于 preview)
```

## Context 传递机制

### Context 结构

```typescript
interface PageContext {
  // 页面标识
  pageName: string;
  pageOrder: number;  // 1, 2, 3...
  generatedAt: string;
  
  // 内容继承
  content: {
    headings: HeadingRecord[];  // {text, level, usedTerms}
    keyTerms: TermRecord[];     // {term, definition, usageCount}
    featureList: string[];
    toneAndManner: string;      // "professional", "casual" etc.
  };
  
  // 设计应用
  design: {
    colorsUsed: ColorUsage[];   // {token, value, usage}
    typographyUsed: TypoUsage[]; // {role, font, size, usage}
    componentsUsed: string[];
  };
  
  // 结构信息
  structure: {
    sections: string[];
    links: LinkRecord[];        // {target, anchor, type}
    navigationItems: string[];
  };
}
```

### Context 合并规则

当生成 Page N 时：

```typescript
function buildContextForPageN(pageN: number, allContexts: PageContext[]): string {
  // 获取前面所有页面的 context
  const previousContexts = allContexts.slice(0, pageN - 1);
  
  // 合并术语表
  const mergedTerms = mergeTermRecords(previousContexts);
  
  // 合并设计 token 使用记录
  const mergedDesignUsage = mergeDesignUsage(previousContexts);
  
  // 构建传递字符串
  return `
## 前面页面 Context 汇总

### 术语表 (必须使用这些术语，不要创造新词)
${mergedTerms.map(t => `- ${t.term}: ${t.definition}`).join('\n')}

### 设计 Token 使用模式
${mergedDesignUsage.map(d => `- ${d.token}: ${d.usage}`).join('\n')}

### 页面结构
${previousContexts.map(c => `- ${c.pageName}: sections = [${c.structure.sections.join(', ')}]`).join('\n')}
`;
}
```

## QA Gate 集成

### 每个 Page 完成后

```markdown
## QA 检查

在继续下一页之前，必须验证：

1. **Design Compliance Check**
   - [ ] 颜色使用 design_spec 中的值
   - [ ] 字体匹配 typography hierarchy
   - [ ] 阴影使用 shadow-as-border 技术
   - [ ] 间距是 8px 倍数

2. **Content Coherence Check**
   - [ ] 术语与前一页一致
   - [ ] 没有创造新的同义词
   - [ ] 语气和调性一致

3. **Technical Check**
   - [ ] 没有硬编码颜色
   - [ ] 没有使用设计系统外的字体
   - [ ] 组件可以正常渲染
```

### 失败处理

```
QA 失败 → 修复策略:
    │
    ├─ Design Issue
    │     └─ 重新生成该 section，使用正确的 design tokens
    │
    ├─ Coherence Issue
    │     └─ 用前一页的术语替换当前页的错误术语
    │
    └─ Technical Issue
          └─ 修复代码错误，重新验证

最大重试次数: 2
超过 → 标记问题，人工介入
```

## 完整生成流程示例

```
用户需求: "AI 编程助手 SaaS 落地页，需要首页、功能页、定价页"

流程:

1. Phase 1: 设计系统选择
   → 用户选择 "vercel"
   
2. Phase 2: 设计确认
   → 确认 8 项设计元素
   
3. Phase 3: 串行页面生成

   === Page 1: Homepage ===
   ├─ 生成 Hero (首要)
   ├─ 并发生成: Features, Testimonials, CTA
   ├─ QA 检查
   └─ 输出: homepage_context

   === Page 2: Features ===
   ├─ 输入: homepage_context
   ├─ 继承术语和设计模式
   ├─ 生成 Features 详情
   ├─ QA 检查
   └─ 输出: features_context

   === Page 3: Pricing ===
   ├─ 输入: homepage_context + features_context
   ├─ 继承: 术语, 设计模式, 功能列表
   ├─ 生成 Pricing
   ├─ QA 检查
   └─ 输出: pricing_context

4. Phase 4: Site-Level QA
   ├─ 术语一致性检查
   ├─ 链接可达性检查
   └─ 视觉一致性检查
```

## Prompt 模板变量说明

| 变量 | 来源 | 说明 |
|------|------|------|
| `{prompt}` | 用户输入 | 原始需求描述 |
| `{brand_name}` | Phase 1 选择 | 设计系统品牌名 |
| `{primary_color}` | DESIGN.md | Primary 颜色值 |
| `{accent_color}` | DESIGN.md | Accent 颜色值 |
| `{font_family}` | DESIGN.md | 字体家族 |
| `{shadow_tokens}` | DESIGN.md | 阴影 token 列表 |
| `{design_rules_summary}` | rules/*.md | 设计规范摘要 |
| `{previous_*}` | PageContext | 前一页的 context |
| `{page_type}` | 用户/规划 | 页面类型 |
