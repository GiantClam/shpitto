# Design Typography Hierarchy Rules

## Purpose

确保组件的字体、字号、粗细、行高、字间距与 DESIGN.md 的 typography 规范一致。

## Rules

### 1. Font Family Declaration

**规则**: 必须使用 DESIGN.md 指定的字体家族。

```tsx
// ❌ 错误: 使用默认字体
<div className="text-lg">Heading</div>

// ✅ 正确: 使用设计系统字体
<div style={{ fontFamily: "'Geist', sans-serif" }}>Heading</div>
```

### 2. Type Scale Adherence

**规则**: 严格遵循 DESIGN.md 的 type scale，禁止自定义字号。

| 层级 | 用途 | 规范来源 |
|------|------|----------|
| Display | Hero 标题 | `typography.find(t => t.role === 'Display')` |
| H1 | 页面标题 | `typography.find(t => t.role === 'H1')` |
| H2 | 区块标题 | `typography.find(t => t.role === 'H2')` |
| H3 | 卡片标题 | `typography.find(t => t.role === 'H3')` |
| Body | 正文 | `typography.find(t => t.role === 'Body')` |
| Small | 辅助文字 | `typography.find(t => t.role === 'Small')` |

### 3. Font Weight Consistency

**规则**: 每个文字层级的粗细必须与规范一致。

```tsx
// ❌ 错误: weight 不匹配
<span className="text-2xl font-light">H2 Title</span>

// ✅ 正确: weight 必须与 typography 规范一致
<span className="text-2xl font-semibold">H2 Title</span>
```

### 4. Line Height Rules

**规则**: 不同类型的文字使用不同的行高。

| 用途 | 推荐行高 |
|------|----------|
| Headings | 1.1 - 1.3 |
| Body text | 1.5 - 1.75 |
| Captions | 1.4 - 1.6 |
| Buttons | 1.0 - 1.2 |

### 5. Letter Spacing

**规则**: 大写标题和特殊元素使用字间距。

```tsx
// ❌ 错误: 缺少字间距
<span className="text-sm uppercase">LABEL</span>

// ✅ 正确: 使用规范中的 letterSpacing
<span className="text-sm uppercase tracking-wider">LABEL</span>
```

### 6. Responsive Typography

**规则**: 字体大小在移动端按比例缩小，但保持可读性。

| 断点 | 缩放比例 |
|------|----------|
| sm (640px) | 0.875x |
| md (768px) | 0.9375x |
| lg (1024px+) | 1x (base) |

## QA Checkpoints

1. 对比 Figma/设计稿与生成代码的字体属性
2. 检查 `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`
3. 使用 `typography` 工具函数自动验证

## Implementation Helper

```tsx
function getTypographyRule(role: string, designSystem: DesignSystem) {
  return designSystem.typography.find(t => t.role === role);
}

// 使用示例
const h1 = getTypographyRule('H1', designSystem);
<h1 style={{
  fontFamily: h1.font,
  fontSize: h1.size,
  fontWeight: h1.weight,
  lineHeight: h1.lineHeight,
  letterSpacing: h1.letterSpacing,
}}>
  Title
</h1>
```
