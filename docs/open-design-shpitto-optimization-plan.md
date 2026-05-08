# Open Design 对标下的 Shpitto 网站生成优化方案

## 目标

Shpitto 是云端网站生成工具，核心产物是可预览、可部署的网站。本方案吸收 Open Design 的设计约束、设计系统、website-only seed skill、视觉方向、设备外壳和 anti-slop 质量机制，但不复制 Open Design 的本地 daemon 或外部 Coding Agent Runtime。

边界约束：

1. Shpitto 只支持网站生成，Open Design skill frontmatter 只允许 `od.mode: website`。
2. 设备外壳只用于展示同一个网站在桌面端、平板端、手机端下的预览效果，不引入 mobile app/deck artifact 生成。
3. Shpitto 运行在云端，不允许调用外部 Coding Agent Runtime；只升级现有 LangChain/skill runtime。
4. Skill 加载必须由 workflow 阶段和用户意图驱动，不能在 TS 中为具体 seed skill 写死分支、alias、bundle 项或场景判断。
5. 具体 seed skill 的适用条件必须放在 `SKILL.md` frontmatter，例如 `name`、`description`、`triggers`、`od.mode`、`od.scenario`，TS 只实现通用扫描、解析、打分和校验。

## 项目约束：Skill 按需加载

这是后续修改 skill runtime 和新增 skill 时必须遵守的约束。

### 允许

- `website-generation-workflow` 作为网站生成 orchestrator 常驻。
- 基础能力 skill 可由 workflow 阶段常驻或按阶段加载，例如 responsive、image、icon、QA、validation。
- seed/layout skill 必须按用户意图和 workflow 阶段选择，例如 dashboard、pricing、saas landing、web prototype。
- 新增 seed skill 时，只添加目录和 `SKILL.md` frontmatter；运行时通过 discovery 自动识别。
- TS 可以实现通用能力：
  - 扫描 `apps/web/skills/*/SKILL.md`
  - 解析 frontmatter
  - 校验 `od.mode === "website"`
  - 根据 `name/triggers/scenario/description` 对用户 brief 和 routes 打分
  - 选择少量高相关 seed skill 注入 prompt
  - 未命中时回退到通用 website seed

### 禁止

- 禁止在 TS 中写死具体 seed skill 名称作为业务分支，例如 `if skill === "dashboard"`。
- 禁止把所有 discovered seed skill 默认塞进每次生成 prompt。
- 禁止在 `WEBSITE_GENERATION_SKILL_BUNDLE` 中长期维护具体 seed skill 列表；该常量只应表达 core workflow/base skill。
- 禁止通过 TS alias 映射具体 seed skill，例如 `web-prototype -> open-design-web-prototype`；短名解析应来自 `SKILL.md` 的 `name` 和 `triggers`。
- 禁止让非 `od.mode: website` 的 skill 进入 Shpitto 网站生成 runtime。

### 推荐实现形态

```text
Core workflow skills
  -> always available

Base capability skills
  -> loaded by workflow phase

Website seed skills
  -> discovered from SKILL.md frontmatter
  -> selected by intent scorer
  -> loaded only when relevant
```

推荐 selector 输入：

```ts
{
  requirementText: string;
  routes: string[];
  maxSkills: number;
}
```

推荐 selector 输出：

```ts
Array<{
  id: string;
  score: number;
  reason: string;
}>
```

验收标准：

- 新增一个 `od.mode: website` seed skill 后，不修改 TS 也能被 discovery 发现。
- 用户 brief 命中特定 trigger 时，只加载相关 seed skill。
- 未命中特定 trigger 时，只加载一个通用 website seed fallback。
- Targeted tests 必须覆盖 discovery、intent selection、非 website mode 拒绝。

## 已落地状态

当前已经完成 6 个阶段的首轮落地：

| 阶段 | 状态 | 主要产物 |
|---|---|---|
| Phase 1 | 已完成 | website brief 视觉方向数据流、方向卡片 UI、prompt 注入 |
| Phase 2 | 已完成 | design system registry、API、gallery/picker |
| Phase 3 | 已完成 | website-only seed skill metadata loader、frontmatter 自动发现、prompt contract |
| Phase 4 | 已完成 | Desktop/Browser/MacBook/iPad/iPhone/Pixel 多设备预览切换 |
| Phase 5 | 已完成 | anti-slop linter、QA retry 合并、单元测试 |
| Phase 6 | 已完成 | LangChain/skill runtime Website Quality Contract |

## 已复用 Open Design 资产

```text
apps/web/public/frames/*
apps/web/skills/open-design-web-prototype/**
apps/web/skills/open-design-saas-landing/**
apps/web/skills/open-design-dashboard/**
apps/web/skills/open-design-pricing-page/**
apps/web/lib/open-design/question-form.ts
apps/web/lib/open-design/design-directions.ts
```

保留说明：

- 四个 seed skill 的 `od.mode` 已收敛为 `website`，`od.platform` 已收敛为 `responsive`。
- 每个复制目录保留 `NOTICE.open-design.md`，记录来源和 Apache-2.0 许可。
- 未保留 `mobile-app`、`simple-deck`、`guizang-ppt` 等非网站生成 skill。

## 总体架构

```text
Chat / Project Workspace
  -> Requirement Enrichment
  -> Canonical Website Prompt Gate
  -> Website Design Brief / Visual Direction
  -> Design System Registry
  -> Website Skill Router
      -> LangChain Skill Runtime
      -> website-only seed skill pack
  -> Site Preview
      -> direct desktop iframe
      -> device shell previews for same website URL
  -> QA
      -> anti-slop linter
      -> existing validateComponent
      -> retry repair feedback
  -> Deploy
```

## 外部参考：khazix-writer 的作者式思考框架

`khazix-skills` 更值得借鉴的不是具体文风，而是它把“先判断、再取材、再约束、再自检”的生成链路做得很完整。Shpitto 的网站生成 skill 可以吸收这套方法论，但必须保持站点生成语境，不把它变成写作 agent。

### 可迁移点

1. 先判断再生成：在进入页面输出前，先判断 brief 是否足够、站点应落成什么页面原型、哪些 route 应优先生成、哪些事实不能猜。
2. 内容原型分类：把页面按 home、landing、content hub、case study、about、contact 等原型分开，避免所有页面都套同一套骨架。
3. 风格变成约束：把“节奏、禁区、句式、情绪、开头/收尾”写成可执行规则，而不是只写成审美描述。
4. 分层自检：至少拆成事实与禁区、IA 与节奏、内容深度、最终体验四层检查，避免只做一次总 QA。
5. 访客感优先：页面应像一个真正理解品牌的人在给访客讲清楚这件事，而不是在展示模块、解释流程或堆砌功能名词。

### 对当前项目的具体映射

- `Canonical Website Prompt` 需要增加“生成前判断清单”，明确页面原型、来源优先级、内容深度和禁用结构。
- `Website Quality Contract` 需要补充“访客感”与“页面节奏”类约束，避免 Feature 1/2/3 式的 AI 模板感。
- `design-directions.ts` 不只定义视觉参考，还应补充内容姿态与页面原型提示，让风格选择和内容策略同步。
- 路由规划应继续保持原型分化，不能让首页、内容聚合页、转化页和关于页共享同一套 hero/body 骨架。
- QA 规则应保持分层：先验证事实和结构，再验证表达和视觉一致性，最后验证整体体验是否像真实品牌输出。

## Phase 1: Website Brief 与视觉方向

落地文件：

```text
apps/web/lib/open-design/design-directions.ts
apps/web/lib/open-design/question-form.ts
apps/web/lib/agent/chat-orchestrator.ts
apps/web/components/chat/ProjectChatWorkspace.tsx
```

实现内容：

- 新增 Shpitto website 专用视觉方向：`editorial-monocle`、`modern-minimal`、`warm-soft`、`tech-utility`、`brutalist-experimental`、`industrial-b2b`、`heritage-manufacturing`。
- 在结构化 brief 的 `visual-system` 中渲染方向卡片，包含色板、气质、参考品牌和选中态。
- 在 `composeStructuredPrompt` 中注入 `Confirmed Visual Direction Contract`，把方向约束进入生成 prompt。

验收：

- `ProjectChatWorkspace.tsx` 文件级 TypeScript diagnostics：0 error。
- `chat-orchestrator.ts` 文件级 TypeScript diagnostics：0 error。
- `design-directions.ts` 文件级 TypeScript diagnostics：0 error。

## Phase 2: Design System Registry/API/Gallery

落地文件：

```text
apps/web/lib/design-system-registry.ts
apps/web/app/api/design-systems/route.ts
apps/web/app/api/design-systems/[id]/route.ts
apps/web/app/api/design-systems/[id]/preview/route.ts
apps/web/components/design-system/DesignSystemPicker.tsx
```

实现内容：

- 从本地 `builder/design-systems/design-md/*/DESIGN.md`、`apps/web/skills/website-generation-workflow/awesome-design-md/design-md/*/DESIGN.md`、`apps/web/skills/design-systems/design-md/*/DESIGN.md` 读取设计系统。
- 读取 `awesome-design.local.index.json` 和 `.cache/awesome-design-md/index.json` 作为 metadata 补充。
- 输出统一 `DesignSystemSummary`：`id/title/category/summary/swatches/sourcePath/source`。
- 提供列表 API、详情 API、HTML 预览 API。
- 新增客户端 `DesignSystemPicker`，展示 swatch、分类、摘要和 preview 链接。

验收：

- registry 与 3 个 API route 文件级 TypeScript diagnostics：0 error。
- `DesignSystemPicker.tsx` 文件级 TypeScript diagnostics：0 error。

## Phase 3: Website-only Seed Skill Pack

落地文件：

```text
apps/web/lib/skill-runtime/od-skill-metadata.ts
apps/web/lib/skill-runtime/project-skill-loader.ts
apps/web/lib/skill-runtime/skill-tool-registry.ts
apps/web/lib/skill-runtime/project-skill-loader.test.ts
```

实现内容：

- 新增 `parseWebsiteSkillMetadata`，解析 `SKILL.md` frontmatter 中的 `od` metadata。
- 若存在 `od` 且 `od.mode !== "website"`，loader 直接拒绝。
- 保留 core workflow skill 常量，不再把具体 seed skill 名逐项写入 TS alias/bundle。
- `listWebsiteSeedSkillIds` 会扫描 `apps/web/skills/*/SKILL.md`，只把 `od.mode: website` 的 skill 纳入 website generation 可用集合。
- `loadProjectSkill("web-prototype")` 这类短名通过 `SKILL.md` 的 `name` / `triggers` 动态解析到实际目录，不需要新增 TS alias。
- `selectWebsiteSeedSkillsForIntent` 会根据用户 requirement、routes、skill `triggers/scenario/name` 打分，按需选择少量 seed skill；未命中才回退到通用 website seed。
- `load_skill` 工具 schema 接受字符串，运行时校验是否属于 core skills 或 `od.mode: website` seed skills。
- `load_skill` 返回内容前追加 `Website Skill Contract`，明确 website-only、responsive、design-system requirements。

验收：

```text
pnpm test -- project-skill-loader.test.ts
```

结果：

```text
Test Files  1 passed
Tests       7 passed
```

## Phase 4: 多设备预览外壳

落地文件：

```text
apps/web/public/frames/*
apps/web/components/chat/ProjectChatWorkspace.tsx
```

实现内容：

- 在右侧预览区增加设备切换：Desktop、Browser、MacBook、iPad、iPhone、Pixel。
- Desktop 仍使用直接 preview iframe。
- 其他设备使用 `/frames/<frame>.html?screen=<task-preview-url>` 展示同一个网站 URL。
- frame 只作为展示层，不进入部署产物。

验收：

- `ProjectChatWorkspace.tsx` 文件级 TypeScript diagnostics：0 error。

后续强化：

- 增加 `screen` 参数同源校验，避免用户手动构造外部 URL 预览。
- 增加 frame route smoke test。

## Phase 5: Anti-Slop Linter 与 QA 合并

落地文件：

```text
apps/web/lib/visual-qa/anti-slop-linter.ts
apps/web/lib/visual-qa/anti-slop-linter.test.ts
apps/web/lib/skill-runtime/executor.ts
```

实现内容：

- 新增 `lintGeneratedWebsiteHtml`，检查：
  - 缺失 viewport meta
  - placeholder/template copy
  - 过少 section
  - 内容过薄
  - 缺失响应式 CSS 策略
  - 缺失视觉锚点
  - 色彩范围过窄
  - 默认字体倾向
- 在 `validatePageWithRetry` 中把 anti-slop 结果与现有 `validateComponent` 合并。
- anti-slop issue 会进入 repair feedback，让下一轮生成修复。

验收：

```text
pnpm test -- anti-slop-linter.test.ts project-skill-loader.test.ts
```

结果：

```text
Test Files  2 passed
Tests       9 passed
```

## Phase 6: LangChain/Skill Runtime 质量合同

落地文件：

```text
apps/web/lib/skill-runtime/website-quality-contract.ts
apps/web/lib/skill-runtime/executor.ts
apps/web/lib/skill-runtime/skill-tool-executor.ts
```

实现内容：

- 新增 `Website Quality Contract`，统一注入 legacy LangChain runtime 与 tool-call skill runtime。
- 约束内容包括：
  - website-only scope
  - desktop/tablet/mobile 多设备 WYSIWYG
  - 本地 design system 为视觉来源
  - 禁止 placeholder/template slop
  - 强视觉方向、表达性字体、背景系统、分层 section
  - CSS 必须有 media query、container query 或 clamp 响应式策略
  - HTML 必须有 viewport meta、semantic landmarks、可访问标签、共享 CSS/JS 引用

验收：

- `website-quality-contract.ts` 文件级 TypeScript diagnostics：0 error。
- `executor.ts` 文件级 TypeScript diagnostics：0 error。
- `skill-tool-executor.ts` 文件级 TypeScript diagnostics：0 error。
- targeted tests：9 passed。

## 测试与验证记录

已通过：

```text
pnpm test -- project-skill-loader.test.ts
pnpm test -- anti-slop-linter.test.ts project-skill-loader.test.ts
```

文件级 TypeScript diagnostics 已覆盖本次新增或修改的核心文件，结果为 0 error。

全量 typecheck 仍存在历史无关失败：

- tests 引用缺失的 `../../scripts/chat-task-worker`
- `apps/web/seed.spec.ts` 缺失 `@playwright/test`

这些错误不是本次阶段落地产生，但会影响全量 `tsc -p apps/web/tsconfig.json --noEmit` 的通过状态。

## 剩余风险

1. `DesignSystemPicker` 当前已可复用，但尚未强接入 chat brief 的 design-system 选择状态。
2. 设备 frame 当前用于预览展示，仍需要补 `screen` 参数同源 sanitizer 测试。
3. anti-slop linter 是首批规则，后续应补充 footer/nav/mobile-nav/external-image/invented-metric 等更细规则。
4. prompt stack 已统一质量合同，但还未做 snapshot 测试锁定最终 prompt 文本。
5. copied Open Design seed skill 内部 markdown 存在上游文本编码痕迹，不影响运行，但后续可做文档清理。

## 后续建议

1. 将 `DesignSystemPicker` 接入 brief 表单，让用户显式选择 design system。
2. 为 `/frames/*` 增加同源 preview sanitizer 和 smoke test。
3. 给 `Website Quality Contract` 与 `load_skill` payload 增加 snapshot tests。
4. 在 QA report 中单独输出 anti-slop issue 分类和 repair 次数。
5. 对 seed skill 的 `assets/template.html` 与 `references/checklist.md` 做摘要索引，减少每轮 prompt token。
