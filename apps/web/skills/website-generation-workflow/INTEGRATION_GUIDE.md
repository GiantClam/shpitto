# Website Generation - 图片与图标集成指南

## 概述

本指南说明如何在网站生成工作流中集成 AI 图片生成和图标库功能。

## 新增 Skills

### 1. web-image-generator

**位置**: `.opencode/skills/web-image-generator/SKILL.md`

**功能**:
- 为网站生成匹配的 AI 图片资源
- 支持 Hero Images、Section Backgrounds、Illustrations 等多种类型
- 提供优化的 prompt 生成策略
- 集成 image_gen.py 工具

**使用场景**:
```bash
# 在 Phase 1.5 调用
/skill web-image-generator
```

### 2. web-icon-library

**位置**: `.opencode/skills/web-icon-library/SKILL.md`

**功能**:
- 提供 Lucide Icons 和 Heroicons 使用指南
- 包含 1000+ 图标的分类和使用示例
- 响应式图标、动画效果、可访问性规范
- 与设计系统集成方案

**使用场景**:
```bash
# 在 Phase 1.5 调用
/skill web-icon-library
```

## 工作流更新

### Phase 1.5: 图片与图标资源准备（新增）

插入在 Phase 1（规划与设计系统）和 Phase 2（分批生成 Section）之间。

#### 执行步骤

**1. 图片资源准备**

```markdown
- [ ] 分析网站结构，确定图片需求列表
- [ ] 为每张图片分类（Hero/Background/Illustration/Screenshot/Icon）
- [ ] 生成优化的 AI 图片 prompts
- [ ] 调用图片生成工具或提供 prompts 给用户
- [ ] 保存图片到 images/ 目录
- [ ] 验证图片风格与设计系统一致性
```

**2. 图标资源准备**

```markdown
- [ ] 安装图标库（npm install lucide-react）
- [ ] 根据功能需求选择合适图标
- [ ] 创建图标使用清单
- [ ] 确保图标尺寸、颜色符合设计系统
- [ ] 添加必要的可访问性属性
```

**3. 质量检查**

```markdown
- [ ] 图片无水印、无不相关元素
- [ ] 图片尺寸符合规范（见下表）
- [ ] 图标语义清晰
- [ ] 所有图片/图标有 alt text
- [ ] 文件大小合理（< 500KB）
```

## 图片生成工具

### 使用 image_gen.py

```bash
# 基础用法
python3 scripts/image_gen.py "your prompt" \
  --aspect_ratio 16:9 \
  --image_size 2K \
  --output project/images \
  --filename hero-main

# 带负面 prompt
python3 scripts/image_gen.py "Modern tech workspace" \
  --aspect_ratio 16:9 \
  --image_size 2K \
  --output website-project/images \
  --filename hero-main \
  --negative_prompt "text, watermark, low quality, blurry"

# 指定后端
python3 scripts/image_gen.py "Abstract background" \
  --backend gemini \
  --aspect_ratio 16:9 \
  --output images
```

### 环境配置

在项目根目录创建 `.env` 文件：

```env
# 选择后端（必需）
IMAGE_BACKEND=gemini

# Gemini 配置
GEMINI_API_KEY=your-api-key
GEMINI_BASE_URL=https://your-proxy-url.com/v1beta
GEMINI_MODEL=gemini-3.1-flash-image-preview

# 或使用其他后端
# IMAGE_BACKEND=openai
# OPENAI_API_KEY=your-api-key

# IMAGE_BACKEND=qwen
# QWEN_API_KEY=your-api-key
```

### 支持的后端

| 层级 | 后端 | 推荐场景 |
|------|------|---------|
| Core | gemini, openai, qwen, zhipu, volcengine | 日常使用 |
| Extended | stability, bfl, ideogram | 特定风格需求 |
| Experimental | siliconflow, fal, replicate | 实验性功能 |

## 图片类型与规范

### 尺寸规范

| 类型 | 推荐尺寸 | 宽高比 | 用途 |
|------|---------|--------|------|
| Hero Image (Desktop) | 2560x1440 | 16:9 | 首屏大图 |
| Hero Image (Mobile) | 1080x1920 | 9:16 | 移动端首屏 |
| Section Background | 1920x1080 | 16:9 | 区块背景 |
| Feature Illustration | 800x600 | 4:3 | 功能插图 |
| Product Screenshot | 1440x900 | 16:10 | 产品展示 |
| Icon/Logo | 512x512 | 1:1 | 图标 |
| Social Share | 1200x630 | 1.91:1 | 社交分享 |

### Prompt 模板

#### Hero Image

```
{subject description}, hero image style, {composition} composition with negative space for text overlay, color palette: {colors}, cinematic lighting, high quality, 8K resolution, professional web design

Negative: text, watermark, busy details, cluttered, low quality, blurry
```

#### Section Background

```
Subtle {theme} background pattern, {style} style, {color scheme}, soft and understated, suitable for web section background, seamless, minimal details, professional

Negative: high contrast, busy, distracting, text, watermark, photorealistic
```

#### Feature Illustration

```
{concept description}, flat design illustration, modern web style, color palette: {colors}, clean lines, minimal details, transparent background, vector style, professional UI illustration

Negative: realistic, photography, 3D render, complex textures, shadows, watermark
```

## 图标库集成

### 安装 Lucide Icons

```bash
# React 项目
npm install lucide-react

# Vue 项目
npm install lucide-vue-next

# 纯 HTML（使用 CDN）
<script src="https://unpkg.com/lucide@latest"></script>
```

### 使用示例

#### React

```jsx
import { Home, User, Settings, Check, ChevronRight } from 'lucide-react';

function Navigation() {
  return (
    <nav>
      {/* 基础使用 */}
      <a href="/"><Home size={20} /> 首页</a>
      
      {/* 自定义颜色 */}
      <a href="/profile"><User size={20} color="#3B82F6" /> 个人</a>
      
      {/* 使用 Tailwind 类 */}
      <a href="/settings">
        <Settings className="w-5 h-5 text-gray-600" /> 设置
      </a>
    </nav>
  );
}
```

#### 纯 HTML

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body>
  <nav>
    <a href="/"><i data-lucide="home"></i> 首页</a>
    <a href="/about"><i data-lucide="info"></i> 关于</a>
    <a href="/contact"><i data-lucide="mail"></i> 联系</a>
  </nav>

  <script>
    lucide.createIcons();
  </script>
</body>
</html>
```

### 常用图标速查

```jsx
// 导航类
Home, Menu, X, ChevronDown, ChevronRight, ArrowRight

// 功能类
Search, Settings, User, Bell, Mail, Phone, Calendar, Download, Share2

// 状态类
Check, X, AlertCircle, Info, HelpCircle, Loader, CheckCircle

// 社交类
Twitter, Facebook, Instagram, Linkedin, Github, Youtube

// 商业类
ShoppingCart, CreditCard, DollarSign, TrendingUp, BarChart, Package
```

### 图标规范

```jsx
// 尺寸规范
<Icon size={16} />  // 小图标（按钮内、表单）
<Icon size={20} />  // 标准图标（导航、列表）
<Icon size={24} />  // 标准图标（导航、列表）
<Icon size={32} />  // 大图标（功能卡片）
<Icon size={48} />  // 大图标（特性展示）
<Icon size={64} />  // 超大图标（Hero section）

// 颜色规范
<Icon color="var(--color-primary)" />
<Icon className="text-blue-500" />
<Icon color="currentColor" />

// 可访问性
<Icon aria-label="返回首页" />  // 纯图标按钮（必需）
<Icon aria-hidden="true" />     // 装饰性图标
```

## 完整工作流示例

### 1. 启动项目

```bash
# 创建项目目录
mkdir my-website-project
cd my-website-project

# 创建必要目录
mkdir images
mkdir src
```

### 2. Phase 1: 规划与设计系统

```markdown
## 设计系统

### 颜色
- Primary: #3B82F6 (Blue)
- Secondary: #8B5CF6 (Purple)
- Accent: #F59E0B (Amber)
- Neutral: #6B7280 (Gray)

### 排版
- Heading: Inter, sans-serif
- Body: Inter, sans-serif

### 间距
- xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px
```

### 3. Phase 1.5: 图片与图标准备

#### 图片需求列表

```markdown
| # | Filename | Type | Dimensions | Purpose |
|---|----------|------|-----------|---------|
| 1 | hero-main.png | Hero Image | 2560x1440 | Landing hero |
| 2 | feature-1.png | Illustration | 800x600 | Feature 1 |
| 3 | feature-2.png | Illustration | 800x600 | Feature 2 |
| 4 | bg-pattern.png | Background | 1920x1080 | Section bg |
```

#### 生成图片

```bash
# Hero Image
python3 scripts/image_gen.py \
  "Modern tech workspace with collaborative team, hero image style, centered composition with negative space for text overlay, color palette: vibrant blue (#3B82F6) and purple accent (#8B5CF6), cinematic lighting, high quality, 8K resolution" \
  --aspect_ratio 16:9 --image_size 2K \
  --output my-website-project/images --filename hero-main \
  --negative_prompt "text, watermark, busy details, cluttered"

# Feature Illustration 1
python3 scripts/image_gen.py \
  "Fast performance concept, flat design illustration, modern web style, color palette: blue (#3B82F6) and purple (#8B5CF6), clean lines, minimal details, transparent background, vector style" \
  --aspect_ratio 4:3 --image_size 1K \
  --output my-website-project/images --filename feature-1 \
  --negative_prompt "realistic, photography, 3D render, shadows"
```

#### 图标清单

```markdown
| 位置 | 图标 | 用途 | 尺寸 |
|------|------|------|------|
| Navigation | Home, Menu, X | 导航菜单 | 20px |
| Hero CTA | ArrowRight | 行动号召 | 20px |
| Features | Zap, Shield, Sparkles | 功能展示 | 32px |
| Footer | Twitter, Github, Mail | 社交链接 | 20px |
```

### 4. Phase 2: 生成 Sections

```jsx
// Hero Section
<section className="hero">
  <img src="/images/hero-main.webp" alt="Modern workspace" />
  <h1>快速构建现代网站</h1>
  <button>
    立即开始 <ArrowRight size={20} />
  </button>
</section>

// Features Section
<section className="features">
  <div className="feature">
    <Zap size={32} color="var(--color-primary)" />
    <h3>快速</h3>
    <p>闪电般的加载速度</p>
  </div>
  <div className="feature">
    <Shield size={32} color="var(--color-primary)" />
    <h3>安全</h3>
    <p>企业级安全保障</p>
  </div>
  <div className="feature">
    <Sparkles size={32} color="var(--color-primary)" />
    <h3>优雅</h3>
    <p>精美的视觉设计</p>
  </div>
</section>
```

## 质量检查清单

### 图片质量

- [ ] 所有图片已保存到 `images/` 目录
- [ ] 文件名符合命名规范（kebab-case）
- [ ] 尺寸符合设计要求
- [ ] 色彩与设计系统一致
- [ ] 无水印或不相关元素
- [ ] 每张图片有 alt text
- [ ] 文件大小合理（< 500KB）
- [ ] 提供 WebP 格式版本

### 图标质量

- [ ] 图标库已安装（lucide-react）
- [ ] 图标语义清晰，符合用户预期
- [ ] 尺寸一致，同一场景使用相同大小
- [ ] 颜色符合设计系统
- [ ] 纯图标按钮有 aria-label
- [ ] 装饰性图标有 aria-hidden="true"
- [ ] 响应式场景考虑不同尺寸
- [ ] 按需导入，避免打包整个库

## 全站双语（EN/ZH）集成指南（新增）

### 目标

为 `website-generation-workflow` 增加全站基础双语切换能力，要求覆盖所有页面关键文案，并保持当前路由不变。

### 最小实现要求

```markdown
- [ ] 默认语言 en，支持 zh
- [ ] 顶部导航提供 EN/ZH 切换入口
- [ ] 关键文案双语覆盖（导航/标题/CTA/表单/页脚）
- [ ] 语言偏好持久化（localStorage）
- [ ] 切换时更新 <html lang>
- [ ] 无 JS 时默认语言可读
```

### 推荐目录结构

```text
project/
  i18n/
    messages.en.json
    messages.zh.json
    README.md
```

### 文案 key 命名建议

```text
nav.home
nav.contact
home.hero.title
home.hero.ctaPrimary
contact.form.email
footer.legal
```

### HTML 静态站示例

```html
<button data-locale-toggle type="button">ZH</button>
<a data-i18n="nav.home" data-en="Home" data-zh="首页">Home</a>
<h1 data-i18n="home.hero.title" data-en="Precision CNC" data-zh="高精度CNC">Precision CNC</h1>
```

```js
const toggle = document.querySelector('[data-locale-toggle]');
const setLocale = (locale) => {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  localStorage.setItem('site-locale', locale);
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const text = el.getAttribute(`data-${locale}`);
    if (text) el.textContent = text;
  });
};
setLocale(localStorage.getItem('site-locale') || 'en');
toggle?.addEventListener('click', () => {
  const next = document.documentElement.lang === 'zh-CN' ? 'en' : 'zh';
  setLocale(next);
});
```

### React 示例

```tsx
const messages = { en: enMessages, zh: zhMessages };
const [locale, setLocale] = useState<'en' | 'zh'>('en');
const t = (key: string) => messages[locale][key] ?? key;

<button onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}>EN/ZH</button>
<a>{t('nav.home')}</a>
<h1>{t('home.hero.title')}</h1>
```

### 双语验收清单

```markdown
- [ ] 所有页面均有语言切换入口
- [ ] 当前页切换语言不跳转/不丢路径
- [ ] 无 `nav.xxx` 这类 key 泄漏到页面
- [ ] `lang` 与 `aria-label` 随语言变化
- [ ] EN 与 ZH 文案都经过人工校对
```

## 常见问题

### Q: 图片生成失败怎么办？

A: 检查以下几点：
1. 确认 `.env` 文件配置正确
2. 检查 `IMAGE_BACKEND` 是否设置
3. 验证 API key 是否有效
4. 查看网络连接是否正常
5. 尝试切换其他后端

### Q: 图片风格不统一？

A: 
1. 在所有 prompts 中使用统一的风格关键词
2. 统一色彩描述（使用设计系统颜色）
3. 统一质量关键词（high quality, professional）
4. 使用同一个后端生成所有图片

### Q: 图标显示不出来？

A:
1. 确认已安装 lucide-react
2. 检查导入语句是否正确
3. 纯 HTML 确认已调用 `lucide.createIcons()`
4. 检查图标名称是否正确（区分大小写）

### Q: 文件太大影响加载速度？

A:
1. 转换为 WebP 格式（减少 30-50% 大小）
2. 使用图片压缩工具（TinyPNG, ImageOptim）
3. 实现懒加载（loading="lazy"）
4. 使用 CDN 加速
5. 提供响应式图片（srcset）

### Q: 切换语言后只导航变化，正文不变？

A:
1. 检查正文节点是否都声明了统一 key（`data-i18n` 或 `t(key)`）
2. 确认正文 key 同时存在于 `messages.en` 和 `messages.zh`
3. 不要在模板中混用硬编码字符串与 i18n key

### Q: 语言切换导致跳到首页？

A:
1. 切换逻辑仅替换文案，不改 `window.location.pathname`
2. 若是多路由站点，保持当前路由并仅更新 locale 状态
3. 避免切换按钮直接绑定到固定 href（如 `/index`）

## 参考资源

- **web-image-generator skill**: `.opencode/skills/web-image-generator/SKILL.md`
- **web-icon-library skill**: `.opencode/skills/web-icon-library/SKILL.md`
- **website-generation-workflow skill**: `.opencode/skills/website-generation-workflow/SKILL.md`
- **Lucide Icons**: https://lucide.dev
- **image_gen.py 文档**: `D:/github/ppt-master-temp/skills/ppt-master/scripts/docs/image.md`

## 下一步

完成 Phase 1.5 后：
1. 更新图片资源列表状态为 "Generated"
2. 确认图标清单完整
3. 通知用户资源已就绪
4. 继续 Phase 2: 分批生成 Section
