---
name: "web-image-generator"
description: "为网站生成匹配的 AI 图片资源，支持 hero images、section backgrounds、illustrations 等多种类型"
---

# Web Image Generator

## 核心使命

为网站生成项目创建优化的 AI 图片资源，包括 hero images、背景图、插图、图标等，确保视觉风格与设计系统一致。

## 适用场景

- 网站生成流程中需要 AI 图片
- 独立生成网站配图
- 替换或优化现有网站图片

## 图片类型分类

### 1. Hero Image（首屏大图）

**特征**：网站首屏的主视觉，需要强烈的视觉冲击力

| 关键点 | 说明 |
|--------|------|
| 高分辨率 | 至少 1920x1080，推荐 2560x1440 |
| 视觉焦点 | 明确的主体，支持文字叠加 |
| 留白区域 | 为标题和 CTA 预留空间 |
| 色彩协调 | 与品牌色系匹配 |

**Prompt 模板**：
```
{subject description}, hero image style, {composition} composition with negative space for text overlay, {color palette}, cinematic lighting, high quality, 8K resolution, professional web design
```

**Negative Prompt**：
```
text, watermark, busy details, cluttered, low quality, blurry
```

### 2. Section Background（区块背景）

**特征**：用于不同 section 的背景，需要低调支撑内容

| 关键点 | 说明 |
|--------|------|
| 低对比度 | 不抢内容风头 |
| 可重复性 | 支持响应式布局 |
| 渐变友好 | 易于与纯色过渡 |
| 轻量化 | 文件大小控制 |

**Prompt 模板**：
```
Subtle {theme} background pattern, {style} style, {color scheme}, soft and understated, suitable for web section background, seamless, minimal details, professional
```

**Negative Prompt**：
```
high contrast, busy, distracting, text, watermark, photorealistic
```

### 3. Feature Illustration（功能插图）

**特征**：展示产品功能或概念的插图

| 关键点 | 说明 |
|--------|------|
| 扁平化 | 现代 Web 风格 |
| 矢量感 | 清晰的线条和形状 |
| 统一风格 | 整站插图保持一致 |
| 透明背景 | 便于叠加 |

**Prompt 模板**：
```
{concept description}, flat design illustration, modern web style, {color palette}, clean lines, minimal details, transparent background, vector style, professional UI illustration
```

**Negative Prompt**：
```
realistic, photography, 3D render, complex textures, shadows, watermark
```

### 4. Product Screenshot（产品截图）

**特征**：展示产品界面或功能的真实截图风格

| 关键点 | 说明 |
|--------|------|
| 真实感 | 模拟真实产品界面 |
| 设备框架 | 可选择添加设备外框 |
| 清晰度 | 高清晰度展示细节 |
| 阴影效果 | 增加立体感 |

**Prompt 模板**：
```
{product interface description}, modern UI design, clean interface, {color scheme}, professional software screenshot style, high resolution, sharp details, realistic mockup
```

**Negative Prompt**：
```
blurry, low quality, distorted, watermark, text overlay
```

### 5. Icon/Logo Placeholder（图标占位）

**特征**：品牌 logo 或装饰性图标

| 关键点 | 说明 |
|--------|------|
| 简洁性 | 高度简化的形状 |
| 可缩放 | 支持多种尺寸 |
| 单色/双色 | 易于主题切换 |
| 透明背景 | 必须 |

**Prompt 模板**：
```
{icon concept} icon, minimalist design, {color}, simple geometric shapes, flat style, transparent background, suitable for web logo, professional branding
```

**Negative Prompt**：
```
complex, detailed, realistic, 3D, shadows, gradients, watermark
```

## 图片生成工作流

### Phase 1: 需求分析

1. 读取设计系统（颜色、字体、风格）
2. 分析网站结构（sections、页面类型）
3. 确定图片需求列表
4. 为每张图片分类（Hero/Background/Illustration/Screenshot/Icon）

### Phase 2: Prompt 生成

为每张图片创建优化的 prompt：

```markdown
## Image Resource List

| # | Filename | Type | Dimensions | Purpose | Status |
|---|----------|------|-----------|---------|--------|
| 1 | hero-main.png | Hero Image | 2560x1440 | Landing page hero | Pending |
| 2 | feature-1.png | Illustration | 800x600 | Feature section | Pending |
| 3 | bg-pattern.png | Background | 1920x1080 | Section background | Pending |
```

### Phase 3: 图片生成

使用统一的图片生成工具：

```bash
# 使用 image_gen.py（如果可用）
python3 scripts/image_gen.py "your prompt" \
  --aspect_ratio 16:9 \
  --image_size 2K \
  --output project/images \
  --filename hero-main

# 或使用其他 AI 图片生成服务
# - Midjourney
# - DALL-E 3
# - Stable Diffusion
# - Gemini Imagen
```

**配置要求**：

```env
IMAGE_BACKEND=gemini  # 或 openai, qwen, zhipu, volcengine
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-3.1-flash-image-preview
```

### Phase 4: 图片优化

生成后的处理：

1. **格式转换**：PNG → WebP（减少文件大小）
2. **响应式版本**：生成 @1x, @2x, @3x 版本
3. **压缩优化**：使用 TinyPNG 或 ImageOptim
4. **Alt 文本**：为每张图片生成无障碍描述

### Phase 5: 集成到代码

```jsx
// React 示例
<img 
  src="/images/hero-main.webp"
  srcSet="/images/hero-main@2x.webp 2x, /images/hero-main@3x.webp 3x"
  alt="Modern workspace with collaborative team"
  loading="lazy"
/>

// HTML 示例
<picture>
  <source srcset="/images/hero-main.webp" type="image/webp">
  <img src="/images/hero-main.png" alt="Modern workspace">
</picture>
```

## 尺寸规范

### 常见网站图片尺寸

| 用途 | 推荐尺寸 | 宽高比 |
|------|---------|--------|
| Hero Image (Desktop) | 2560x1440 | 16:9 |
| Hero Image (Mobile) | 1080x1920 | 9:16 |
| Feature Illustration | 800x600 | 4:3 |
| Section Background | 1920x1080 | 16:9 |
| Product Screenshot | 1440x900 | 16:10 |
| Icon/Logo | 512x512 | 1:1 |
| Social Share Image | 1200x630 | 1.91:1 |

### 响应式断点

```css
/* Mobile First */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

## 色彩集成

从设计系统提取颜色并转换为 prompt：

```javascript
// 设计系统
const colors = {
  primary: '#3B82F6',    // Blue
  secondary: '#8B5CF6',  // Purple
  accent: '#F59E0B',     // Amber
  neutral: '#6B7280'     // Gray
}

// 转换为 prompt
"color palette: vibrant blue (#3B82F6), purple accent (#8B5CF6), warm amber highlights (#F59E0B)"
```

## Prompt 优化技巧

### 通用质量提升关键词

```
高质量：high quality, 8K resolution, sharp details, professional
构图：centered composition, rule of thirds, balanced layout
光效：soft lighting, natural light, cinematic lighting
风格：modern, clean, minimalist, professional
```

### 避免的关键词

```
❌ realistic (除非需要照片风格)
❌ 3D render (除非特定需求)
❌ complex details (Web 图片需要简洁)
❌ dark, gloomy (除非品牌调性)
```

## 工具集成

### 方法 1: 使用 image_gen.py（推荐）

```bash
# 生成 hero image
python3 scripts/image_gen.py \
  "Modern tech workspace with collaborative team, hero image style, centered composition with negative space for text overlay, color palette: blue (#3B82F6) and purple (#8B5CF6), cinematic lighting, high quality, 8K resolution" \
  --aspect_ratio 16:9 \
  --image_size 2K \
  --output website-project/images \
  --filename hero-main \
  --negative_prompt "text, watermark, busy details, cluttered, low quality"
```

### 方法 2: 直接调用 API

```javascript
// 示例：调用 OpenAI DALL-E
const response = await openai.images.generate({
  model: "dall-e-3",
  prompt: "your optimized prompt",
  size: "1792x1024",
  quality: "hd",
  n: 1,
});
```

### 方法 3: 手动生成

1. 将生成的 prompts 保存到 `images/image_prompts.md`
2. 用户在 Midjourney/DALL-E/Gemini 等平台生成
3. 下载后放入 `images/` 目录

## 质量检查清单

生成完成后检查：

- [ ] 所有图片已保存到 `images/` 目录
- [ ] 文件名符合命名规范（kebab-case）
- [ ] 尺寸符合设计要求
- [ ] 色彩与设计系统一致
- [ ] 无水印或不相关元素
- [ ] 为每张图片生成了 Alt 文本
- [ ] 文件大小合理（< 500KB for web）

## 与 Website Generation Workflow 集成

在 website-generation-workflow 的 Phase 1.5 插入：

```
Phase 1: 规划与设计系统
  ↓
Phase 1.5: 图片资源生成 ← 使用 web-image-generator
  ↓
Phase 2: 分批生成 Section
```

## 输出文档模板

创建 `project/images/image_prompts.md`：

```markdown
# Website Image Generation Prompts

> Project: {project_name}
> Generated: {date}
> Design System: Primary {#HEX} | Secondary {#HEX} | Accent {#HEX}

---

## Image Resource List

| # | Filename | Type | Dimensions | Purpose | Status |
|---|----------|------|-----------|---------|--------|
| 1 | hero-main.png | Hero Image | 2560x1440 | Landing hero | Pending |

---

## Detailed Prompts

### Image 1: hero-main.png

**Type**: Hero Image  
**Dimensions**: 2560x1440 (16:9)  
**Purpose**: Landing page hero section

**Prompt**:
Modern tech workspace with collaborative team, hero image style, centered composition with negative space for text overlay, color palette: vibrant blue (#3B82F6) and purple accent (#8B5CF6), cinematic lighting, high quality, 8K resolution, professional web design

**Negative Prompt**:
text, watermark, busy details, cluttered, low quality, blurry

**Alt Text**:
> Modern collaborative workspace with team members working together on technology projects

**Generation Command**:
```bash
python3 scripts/image_gen.py "Modern tech workspace..." --aspect_ratio 16:9 --image_size 2K -o images -f hero-main
```

---

## Usage Instructions

1. 使用上述命令生成图片，或
2. 复制 Prompt 到 AI 图片生成平台
3. 下载后重命名为对应文件名
4. 放入 `images/` 目录
```

## 常见问题

### Q: 图片风格不统一怎么办？

A: 在所有 prompts 中使用统一的风格关键词，例如：
- 统一添加 "flat design, modern web style"
- 统一色彩描述
- 统一质量关键词

### Q: 生成的图片有水印？

A: 
- 使用 `--negative_prompt "watermark, signature, text"`
- 如果是 Gemini，使用 `gemini_watermark_remover.py` 移除

### Q: 文件太大影响加载速度？

A:
- 转换为 WebP 格式
- 使用图片压缩工具
- 实现懒加载（lazy loading）
- 使用 CDN

## 下一步

图片生成完成后：
1. 更新图片资源列表状态为 "Generated"
2. 通知用户图片已就绪
3. 继续 website-generation-workflow 的下一阶段
