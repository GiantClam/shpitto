---
name: "web-icon-library"
description: "网站图标库集成指南，提供 Lucide Icons 和 Heroicons 的使用规范和最佳实践"
---

# Web Icon Library Integration

## 推荐图标库

### 1. Lucide Icons（主推荐）

**特点**：
- 1000+ 精美图标
- 一致的设计语言
- 支持 React、Vue、Svelte、纯 HTML
- 完全开源（ISC License）
- 24x24 基础尺寸
- 可自定义颜色、大小、描边宽度

**官网**：https://lucide.dev

**安装**：
```bash
# React
npm install lucide-react

# Vue
npm install lucide-vue-next

# 纯 HTML/CDN
<script src="https://unpkg.com/lucide@latest"></script>
```

### 2. Heroicons（备选）

**特点**：
- Tailwind CSS 官方图标库
- 292 个精选图标
- Outline 和 Solid 两种风格
- MIT License
- 24x24 基础尺寸

**官网**：https://heroicons.com

**安装**：
```bash
# React
npm install @heroicons/react

# 纯 HTML/CDN
直接使用 SVG 代码
```

## Lucide Icons 使用指南

### React 使用方式

```jsx
import { Home, User, Settings, ChevronRight, Check } from 'lucide-react';

function MyComponent() {
  return (
    <div>
      {/* 基础使用 */}
      <Home />
      
      {/* 自定义大小和颜色 */}
      <User size={32} color="#3B82F6" />
      
      {/* 自定义描边宽度 */}
      <Settings size={24} strokeWidth={1.5} />
      
      {/* 使用 CSS 类 */}
      <ChevronRight className="w-6 h-6 text-blue-500" />
      
      {/* 绝对像素大小 */}
      <Check absoluteStrokeWidth size={20} />
    </div>
  );
}
```

### 纯 HTML/CDN 使用方式

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body>
  <!-- 使用 data-lucide 属性 -->
  <i data-lucide="home"></i>
  <i data-lucide="user" class="w-8 h-8 text-blue-500"></i>
  <i data-lucide="settings"></i>

  <script>
    // 初始化所有图标
    lucide.createIcons();
  </script>
</body>
</html>
```

### 内联 SVG 方式（推荐用于静态网站）

```html
<!-- 直接嵌入 SVG 代码 -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  <polyline points="9 22 9 12 15 12 15 22"/>
</svg>
```

## 常用图标分类

### 导航类

```jsx
import { 
  Home,           // 首页
  Menu,           // 菜单
  X,              // 关闭
  ChevronDown,    // 下拉
  ChevronRight,   // 右箭头
  ArrowRight,     // 箭头
  ExternalLink    // 外部链接
} from 'lucide-react';
```

### 功能类

```jsx
import {
  Search,         // 搜索
  Settings,       // 设置
  User,           // 用户
  Bell,           // 通知
  Mail,           // 邮件
  Phone,          // 电话
  Calendar,       // 日历
  Clock,          // 时间
  Download,       // 下载
  Upload,         // 上传
  Share2,         // 分享
  Heart,          // 喜欢
  Star,           // 收藏
  Bookmark        // 书签
} from 'lucide-react';
```

### 状态类

```jsx
import {
  Check,          // 成功/完成
  X,              // 错误/关闭
  AlertCircle,    // 警告
  Info,           // 信息
  HelpCircle,     // 帮助
  Loader,         // 加载中
  CheckCircle,    // 成功圆圈
  XCircle,        // 错误圆圈
  AlertTriangle   // 警告三角
} from 'lucide-react';
```

### 社交媒体类

```jsx
import {
  Twitter,        // Twitter/X
  Facebook,       // Facebook
  Instagram,      // Instagram
  Linkedin,       // LinkedIn
  Github,         // GitHub
  Youtube,        // YouTube
  Mail            // Email
} from 'lucide-react';
```

### 商业类

```jsx
import {
  ShoppingCart,   // 购物车
  CreditCard,     // 支付
  DollarSign,     // 价格
  TrendingUp,     // 增长
  BarChart,       // 图表
  PieChart,       // 饼图
  Package,        // 产品
  Truck           // 配送
} from 'lucide-react';
```

### 文件/编辑类

```jsx
import {
  File,           // 文件
  FileText,       // 文本文件
  Folder,         // 文件夹
  Image,          // 图片
  Video,          // 视频
  Music,          // 音乐
  Edit,           // 编辑
  Trash,          // 删除
  Copy,           // 复制
  Save            // 保存
} from 'lucide-react';
```

## 图标使用规范

### 尺寸规范

```jsx
// 小图标（按钮内、表单）
<Icon size={16} />

// 标准图标（导航、列表）
<Icon size={20} />
<Icon size={24} />

// 大图标（功能卡片、特性展示）
<Icon size={32} />
<Icon size={48} />

// 超大图标（Hero section、空状态）
<Icon size={64} />
<Icon size={96} />
```

### 颜色规范

```jsx
// 使用设计系统颜色
<Icon color="var(--color-primary)" />
<Icon color="var(--color-secondary)" />

// 使用 Tailwind 类
<Icon className="text-blue-500" />
<Icon className="text-gray-600" />

// 继承父元素颜色
<Icon color="currentColor" />
```

### 描边宽度

```jsx
// 细线（优雅、轻量）
<Icon strokeWidth={1} />
<Icon strokeWidth={1.5} />

// 标准（推荐）
<Icon strokeWidth={2} />

// 粗线（强调、醒目）
<Icon strokeWidth={2.5} />
<Icon strokeWidth={3} />
```

## 响应式图标

```jsx
// Tailwind CSS 响应式
<Icon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />

// 或使用 size prop
<Icon size={isMobile ? 20 : 24} />
```

## 动画效果

### 旋转动画（加载中）

```jsx
import { Loader } from 'lucide-react';

<Loader className="animate-spin" />
```

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
```

### 悬停效果

```jsx
<Icon className="transition-colors hover:text-blue-500" />
<Icon className="transition-transform hover:scale-110" />
```

## 可访问性

### 添加 aria-label

```jsx
// React
<Home aria-label="返回首页" />

// HTML
<i data-lucide="home" aria-label="返回首页"></i>
```

### 装饰性图标

```jsx
// 纯装饰，屏幕阅读器忽略
<Icon aria-hidden="true" />
```

### 按钮中的图标

```jsx
// 带文字的按钮
<button>
  <Home className="mr-2" />
  返回首页
</button>

// 纯图标按钮（必须有 aria-label）
<button aria-label="返回首页">
  <Home />
</button>
```

## 图标组件封装（推荐）

```jsx
// components/Icon.jsx
import * as LucideIcons from 'lucide-react';

export function Icon({ name, size = 24, color = 'currentColor', className = '', ...props }) {
  const IconComponent = LucideIcons[name];
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }
  
  return (
    <IconComponent 
      size={size} 
      color={color} 
      className={className}
      {...props}
    />
  );
}

// 使用
<Icon name="Home" size={24} />
<Icon name="User" className="text-blue-500" />
```

## 图标搜索工具

### 在线搜索
- Lucide: https://lucide.dev/icons
- Heroicons: https://heroicons.com

### 命令行搜索（如果有本地副本）

```bash
# 搜索包含 "home" 的图标
grep -r "home" node_modules/lucide-react/dist/esm/icons/

# 列出所有可用图标
ls node_modules/lucide-react/dist/esm/icons/
```

## 性能优化

### Tree Shaking（按需导入）

```jsx
// ✅ 好：只导入需要的图标
import { Home, User } from 'lucide-react';

// ❌ 差：导入整个库
import * as Icons from 'lucide-react';
```

### 懒加载

```jsx
import { lazy, Suspense } from 'react';

const Icon = lazy(() => import('./Icon'));

<Suspense fallback={<div className="w-6 h-6" />}>
  <Icon name="Home" />
</Suspense>
```

### SVG Sprite（大量图标场景）

```html
<!-- 定义 sprite -->
<svg style="display: none;">
  <symbol id="icon-home" viewBox="0 0 24 24">
    <path d="..."/>
  </symbol>
</svg>

<!-- 使用 -->
<svg class="w-6 h-6">
  <use href="#icon-home"/>
</svg>
```

## 与设计系统集成

### CSS 变量

```css
:root {
  --icon-size-sm: 16px;
  --icon-size-md: 24px;
  --icon-size-lg: 32px;
  --icon-color-primary: #3B82F6;
  --icon-color-secondary: #6B7280;
}

.icon {
  width: var(--icon-size-md);
  height: var(--icon-size-md);
  color: var(--icon-color-primary);
}
```

### Tailwind 配置

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      spacing: {
        'icon-sm': '16px',
        'icon-md': '24px',
        'icon-lg': '32px',
      }
    }
  }
}
```

## 常见使用场景

### 导航栏

```jsx
<nav>
  <a href="/"><Home size={20} /> 首页</a>
  <a href="/about"><Info size={20} /> 关于</a>
  <a href="/contact"><Mail size={20} /> 联系</a>
</nav>
```

### 功能卡片

```jsx
<div className="feature-card">
  <div className="icon-wrapper">
    <Zap size={48} color="#3B82F6" />
  </div>
  <h3>快速高效</h3>
  <p>闪电般的加载速度</p>
</div>
```

### 按钮

```jsx
<button className="btn-primary">
  <Download size={20} />
  下载应用
</button>

<button className="btn-icon" aria-label="搜索">
  <Search size={20} />
</button>
```

### 列表项

```jsx
<ul>
  <li><Check size={16} className="text-green-500" /> 功能一</li>
  <li><Check size={16} className="text-green-500" /> 功能二</li>
  <li><Check size={16} className="text-green-500" /> 功能三</li>
</ul>
```

### 状态提示

```jsx
<div className="alert alert-success">
  <CheckCircle size={20} />
  操作成功！
</div>

<div className="alert alert-error">
  <XCircle size={20} />
  操作失败！
</div>
```

## 图标替换映射表

从其他图标库迁移到 Lucide：

| Font Awesome | Heroicons | Lucide |
|--------------|-----------|--------|
| fa-home | HomeIcon | Home |
| fa-user | UserIcon | User |
| fa-cog | CogIcon | Settings |
| fa-search | MagnifyingGlassIcon | Search |
| fa-bars | Bars3Icon | Menu |
| fa-times | XMarkIcon | X |
| fa-check | CheckIcon | Check |
| fa-chevron-down | ChevronDownIcon | ChevronDown |

## 质量检查清单

使用图标时确保：

- [ ] 图标语义清晰，符合用户预期
- [ ] 尺寸一致，同一场景使用相同大小
- [ ] 颜色符合设计系统
- [ ] 纯图标按钮有 aria-label
- [ ] 装饰性图标有 aria-hidden="true"
- [ ] 响应式场景考虑不同尺寸
- [ ] 按需导入，避免打包整个库
- [ ] 悬停/激活状态有视觉反馈

## 与 Website Generation Workflow 集成

在生成网站代码时：

1. **自动导入常用图标**
2. **根据 section 类型选择合适图标**
3. **确保图标与设计系统颜色一致**
4. **添加必要的可访问性属性**

示例：

```jsx
// Hero Section
<section className="hero">
  <h1>快速构建现代网站</h1>
  <button>
    <Rocket size={20} />
    立即开始
  </button>
</section>

// Features Section
<div className="features">
  <div className="feature">
    <Zap size={32} color="var(--color-primary)" />
    <h3>快速</h3>
  </div>
  <div className="feature">
    <Shield size={32} color="var(--color-primary)" />
    <h3>安全</h3>
  </div>
  <div className="feature">
    <Sparkles size={32} color="var(--color-primary)" />
    <h3>优雅</h3>
  </div>
</div>
```

## 参考资源

- Lucide 官方文档: https://lucide.dev/guide
- Heroicons 官方网站: https://heroicons.com
- Icon 设计原则: https://www.nngroup.com/articles/icon-usability
- 可访问性指南: https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html
