# Design Color Compliance Rules

## Purpose

验证组件使用的颜色与 DESIGN.md 规范完全一致。

## Rules

### 1. Primary Color Usage

**规则**: 所有主按钮、CTA、关键 UI 元素必须使用 DESIGN.md 中定义的 primary 颜色。

**检查项**:
- [ ] 主按钮使用 `colors.primary[0].value`
- [ ] CTA 背景使用 primary 或其渐变变体
- [ ] Logo 和品牌元素使用 primary

**错误示例**:
```tsx
// ❌ 错误: 使用硬编码颜色
<button className="bg-blue-600">Submit</button>

// ✅ 正确: 使用设计系统 token
<button className="bg-primary">Submit</button>
```

### 2. Semantic Color Mapping

**规则**: 状态颜色（success、error、warning、info）必须映射到 DESIGN.md 的 semantic 颜色。

| 语义 | DESIGN.md 字段 |
|------|---------------|
| Success | `colors.semantic` 中包含 "success" 的颜色 |
| Error | `colors.semantic` 中包含 "error" 的颜色 |
| Warning | `colors.semantic` 中包含 "warning" 的颜色 |

### 3. Neutral Palette Usage

**规则**: 背景、边框、禁用状态必须使用 neutral 颜色体系。

**检查项**:
- [ ] Page background 使用 neutral[0] 或 neutral[1]
- [ ] Card background 使用 neutral[1] 或 neutral[2]
- [ ] Borders 使用 neutral[3] 或 neutral[4]
- [ ] Disabled text 使用 neutral[5]

### 4. Contrast Ratio

**规则**: 文本与背景的对比度必须满足 WCAG AA 标准。

- Normal text (< 18px): 4.5:1 minimum
- Large text (≥ 18px bold): 3:1 minimum
- UI components: 3:1 minimum

### 5. Color Token Extraction

生成代码时，必须提取并使用 CSS 变量：

```tsx
// ✅ 正确: 提取为 CSS 变量
<div style={{
  '--color-primary': designSystem.colors.primary[0].value,
  '--color-neutral': designSystem.colors.neutral[0].value,
}}>
  <button style={{ background: 'var(--color-primary)' }}>CTA</button>
</div>
```

## QA Checkpoints

1. 截图对比原始网站与生成结果的颜色
2. 使用浏览器 DevTools 检查 computed styles
3. 运行 `run-design-qa` 验证颜色合规性
