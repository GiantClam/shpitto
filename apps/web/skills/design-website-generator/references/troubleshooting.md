# Troubleshooting Guide

## Common Issues & Solutions

### Issue: Design System Not Found

**错误信息**: `Failed to load design system: brand-name`

**原因**: 品牌名称拼写错误或设计系统目录不存在

**解决方案**:
```bash
# 1. 列出所有可用设计系统
list-design-systems

# 2. 使用确切的品牌名称
generate-website --brand "vercel"  # 不是 "Vercel" 或 "VERCEL"
```

---

### Issue: Generated Colors Don't Match Original

**症状**: 生成的按钮颜色与参考网站不一致

**排查步骤**:
1. 检查 `design-system.colors.primary` 是否正确解析
2. 确认使用的是 CSS 变量而非硬编码
3. 查看浏览器 DevTools 的 computed styles

**解决方案**:
```tsx
// 确保使用设计系统的颜色值
const primaryColor = designSystem.colors.primary[0].value;
// 然后在组件中使用
<button style={{ background: primaryColor }}>CTA</button>
```

---

### Issue: Typography Looks Wrong

**症状**: 字体、字号或行高与参考不一致

**排查步骤**:
1. 检查 `design-system.typography` 是否正确解析
2. 确认字体文件是否正确加载
3. 检查是否有 CSS 优先级问题

**常见原因**:
- 字体名称拼写错误（如 `Inter` 写成 `Inter,`)
- 多个字体叠加导致覆盖

---

### Issue: Shadow Effect Not Visible

**症状**: 卡片边框阴影不显示

**排查步骤**:
1. 检查是否同时使用了 `border` 和 `shadow`
2. 确认 shadow token 是否正确
3. 验证阴影值是否被正确应用

**解决方案**:
```tsx
// ❌ 错误: border 会覆盖 shadow-as-border 效果
<div className="border shadow-border">Card</div>

// ✅ 正确: 只使用 shadow
<div className="shadow-border">Card</div>
```

---

### Issue: Layout Breaks on Mobile

**症状**: 区块间距或宽度在移动端不正确

**排查步骤**:
1. 检查是否使用了 `max-w-[1200px]` 等限制
2. 确认 responsive prefix（sm:, md:, lg:）是否正确
3. 验证 padding 是否随断点变化

**解决方案**:
```tsx
// ✅ 正确的响应式布局
<div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
  <div className="py-8 lg:py-16">
    {content}
  </div>
</div>
```

---

### Issue: Magic UI Animations Not Working

**症状**: 动画组件没有动效

**排查步骤**:
1. 确认组件是 client component（使用了 `'use client'`）
2. 检查是否正确导入动画库
3. 验证 `prefers-reduced-motion` 设置

**解决方案**:
```tsx
// 确保是 client component
'use client';

import { Marquee } from '@/components/magic-ui/marquee';

// 验证导入
import { AnimatedBeam } from '@/components/magic-ui/animated-beam';
```

---

### Issue: QA Check Fails

**症状**: `run-design-qa` 返回多个违规

**常见违规类型**:
1. 颜色合规性 - 使用了硬编码颜色
2. 字体层级 - 字号/粗细不匹配
3. 阴影技术 - 同时使用 border + shadow
4. 间距系统 - 使用了非 8px 倍数的间距

**解决方案**:
```bash
# 逐项修复后重新运行 QA
run-design-qa --components [生成的组件] --designSystem "品牌名"

# 查看详细违规报告
run-design-qa --components [组件] --designSystem "品牌" --verbose
```

---

## Debug Mode

启用 debug 模式获取更多日志：

```bash
# 设置环境变量
export DEBUG=design-website-generator:*

# 然后运行命令
generate-website --prompt "..." --brand "vercel"
```

## Getting Help

1. 查看 `rules/` 目录下的设计规范文档
2. 检查 `references/` 目录的示例代码
3. 使用 `list-design-systems` 确认设计系统可用
