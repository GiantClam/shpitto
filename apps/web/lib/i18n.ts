export type Locale = "en" | "zh";

export const LOCALE_COOKIE_NAME = "shpitto_locale";
export const DEFAULT_LOCALE: Locale = "en";

export function normalizeLocale(value: unknown): Locale {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "cn" || normalized === "chinese") return "zh";
  return "en";
}

export type LandingCopy = {
  nav: {
    projects: string;
    features: string;
    showcase: string;
    blog: string;
    login: string;
    getStarted: string;
    accountPassword: string;
    signOut: string;
  };
  hero: {
    badge: string;
    headline: string;
    highlight: string;
    body: string;
    cta: string;
    demo: string;
    stats: Array<{ value: string; label: string }>;
    promptPlaceholder: string;
  };
  efficiency: {
    metricLabel: string;
    metricValue: string;
    badge: string;
    title: string;
    highlight: string;
    body: string;
    features: Array<{ title: string; description: string }>;
  };
  quality: {
    badge: string;
    title: string;
    body: string;
    learnMore: string;
    features: Array<{ title: string; description: string }>;
  };
  blog: {
    badge: string;
    title: string;
    viewAll: string;
    readArticle: string;
    posts: Array<{ title: string; excerpt: string; category: string }>;
  };
  finalCta: {
    title: string;
    body: string;
    button: string;
  };
  footer: {
    description: string;
    product: string;
    resources: string;
    company: string;
    links: Record<string, string>;
    copyright: string;
  };
  launch: {
    badge: string;
    title: string;
    body: string;
    pillars: Array<{ title: string; desc: string }>;
    recentProjects: string;
    activeDrafts: string;
    openInStudio: string;
    emptyRecent: string;
    recommendedTemplates: string;
    curatedStyles: string;
    browseAll: string;
    useTemplate: string;
    composer: {
      label: string;
      defaultPrompt: string;
      placeholder: string;
      chips: string[];
      send: string;
      newProject: string;
      createFailed: string;
    };
  };
  login: {
    welcome: string;
    subtitle: string;
    google: string;
    divider: string;
    email: string;
    password: string;
    passwordPlaceholder: string;
    signIn: string;
    forgotPassword: string;
    sendResetLink: string;
    backToSignIn: string;
    resetLinkSent: string;
    noAccount: string;
    signUp: string;
    emailConfirmation: string;
    oauthMissing: string;
    oauthFailed: string;
    legal: string;
  };
};

export const landingCopy: Record<Locale, LandingCopy> = {
  en: {
    nav: {
      projects: "Projects",
      features: "Features",
      showcase: "Showcase",
      blog: "Blog",
      login: "Log in",
      getStarted: "Get Started",
      accountPassword: "Password",
      signOut: "Sign out",
    },
    hero: {
      badge: "Minute-Level Generation Engine",
      headline: "Build websites",
      highlight: "at the speed of thought.",
      body: "Shpitto turns natural language into production-grade industrial websites with clean structure, conversion-focused copy, and deploy-ready pages.",
      cta: "Start Building Free",
      demo: "Watch Demo",
      stats: [
        { value: "10,000+", label: "Sites generated" },
        { value: "Minutes", label: "Avg build time" },
        { value: "4.9/5", label: "User rating" },
      ],
      promptPlaceholder: "Describe your industrial website...",
    },
    efficiency: {
      metricLabel: "Generation Time",
      metricValue: "Minutes",
      badge: "Efficiency First",
      title: "No more blank pages.",
      highlight: "Smart generation at your fingertips.",
      body: "Traditional web development takes weeks. Shpitto cuts that down to minutes. Describe your business and get ready-to-ship structure, copy, imagery guidance, and deployment path.",
      features: [
        {
          title: "Understands Your Business Logic",
          description: "Not just generating text, but capturing industry terminology and business process context for precise, trustworthy output.",
        },
        {
          title: "Automated Content Architecture",
          description: "Automatically composes Hero, product modules, proof blocks, and contact capture structure using practical SEO conventions.",
        },
      ],
    },
    quality: {
      badge: "Design Excellence",
      title: "Engineered for Aesthetics",
      body: "Shpitto doesn't just write code. It composes experiences with coherent spacing, visual hierarchy, and conversion-ready interaction patterns.",
      learnMore: "Learn more",
      features: [
        { title: "Adaptive Typography", description: "Smart font pairing and hierarchy tuned for readability in long B2B pages." },
        { title: "Micro-Interactions", description: "Subtle motion that adds confidence and speed cues without noise." },
        { title: "Color Harmony", description: "Balanced palettes that keep industrial trust while adding warmth." },
        { title: "Responsive Grids", description: "Layouts that adapt smoothly from mobile to large desktop previews." },
      ],
    },
    blog: {
      badge: "Latest Insights",
      title: "Industry Insights & Stories",
      viewAll: "View All Articles",
      readArticle: "Read Article",
      posts: [
        {
          title: "The Future of Industrial Web Design: AI-Driven & Data-First",
          excerpt: "How AI is transforming the way manufacturing companies build their digital presence, moving from static brochures to dynamic lead generation engines.",
          category: "Industry Trends",
        },
        {
          title: "Case Study: How Apex Robotics Doubled Leads in 30 Days",
          excerpt: "A deep dive into how a robotics startup used Shpitto to rebuild their site and optimize for conversion speed.",
          category: "Case Study",
        },
        {
          title: "SEO for Manufacturers: 5 Key Strategies for 2026",
          excerpt: "Why traditional B2B SEO is dead, and how to structure your product catalog for the semantic search era.",
          category: "Growth Strategy",
        },
      ],
    },
    finalCta: {
      title: "Ready to Launch Faster?",
      body: "Join thousands of industrial leaders who are growing fast with Shpitto. No credit card required.",
      button: "Start Your Project Now",
    },
    footer: {
      description: "The AI-powered website builder designed specifically for the industrial sector. Smart, fast, and professional.",
      product: "Product",
      resources: "Resources",
      company: "Company",
      copyright: "(c) 2026 Shpitto Inc. All rights reserved.",
      links: {
        features: "Features",
        pricing: "Pricing",
        showcase: "Showcase",
        integrations: "Integrations",
        blog: "Blog",
        documentation: "Documentation",
        community: "Community",
        helpCenter: "Help Center",
        about: "About Us",
        careers: "Careers",
        legal: "Legal",
        contact: "Contact",
        privacy: "Privacy Policy",
        terms: "Terms of Service",
      },
    },
    launch: {
      badge: "Launch Center",
      title: "What do you want to build next?",
      body: "Start with a conversation, continue from your recent projects, or bootstrap with a ready template.",
      pillars: [
        { title: "Conversation-first", desc: "Describe goals and constraints in plain words." },
        { title: "Project memory", desc: "Continue existing sessions with stored context." },
        { title: "Template boost", desc: "Start with battle-tested industrial structures." },
      ],
      recentProjects: "Recent Projects",
      activeDrafts: "Active Drafts",
      openInStudio: "Open in Studio",
      emptyRecent: "No recent projects yet. Start a conversation to create your first draft.",
      recommendedTemplates: "Recommended Templates",
      curatedStyles: "Curated Styles",
      browseAll: "Browse all",
      useTemplate: "Use template",
      composer: {
        label: "Conversation",
        defaultPrompt: "Build a clean, conversion-focused site for our precision components business. Keep technical proof above the fold, then route visitors by industry use case.",
        placeholder: "Describe the project you want to build...",
        chips: ["Reference", "Project", "Template"],
        send: "Send",
        newProject: "New Project",
        createFailed: "Failed to create project.",
      },
    },
    login: {
      welcome: "Welcome Back",
      subtitle: "Sign in to continue building smart.",
      google: "Continue with Google",
      divider: "Or continue with email",
      email: "Email",
      password: "Password",
      passwordPlaceholder: "••••••••",
      signIn: "Sign In",
      forgotPassword: "Forgot password?",
      sendResetLink: "Send reset link",
      backToSignIn: "Back to sign in",
      resetLinkSent: "If an account exists for this email, a password reset link has been sent.",
      noAccount: "Don't have an account? ",
      signUp: "Sign up",
      emailConfirmation: "Check your email for the confirmation link.",
      oauthMissing: "Google OAuth URL not returned by Supabase SDK.",
      oauthFailed: "Failed to open Google OAuth",
      legal: "By continuing, you agree to Shpitto's Terms of Service and Privacy Policy.",
    },
  },
  zh: {
    nav: {
      projects: "项目",
      features: "功能",
      showcase: "案例",
      blog: "博客",
      login: "登录",
      getStarted: "开始使用",
      accountPassword: "修改密码",
      signOut: "退出登录",
    },
    hero: {
      badge: "分钟级网站生成引擎",
      headline: "用自然语言生成网站",
      highlight: "把想法快速变成上线页面。",
      body: "Shpitto 将自然语言转化为可交付的工业网站，自动整理清晰结构、转化文案和可部署页面。",
      cta: "免费开始生成",
      demo: "观看演示",
      stats: [
        { value: "10,000+", label: "已生成网站" },
        { value: "分钟级", label: "平均生成时间" },
        { value: "4.9/5", label: "用户评分" },
      ],
      promptPlaceholder: "描述你的工业网站需求...",
    },
    efficiency: {
      metricLabel: "生成时间",
      metricValue: "分钟级",
      badge: "效率优先",
      title: "不再从空白页开始。",
      highlight: "用对话完成网站规划和生成。",
      body: "传统网站开发通常需要数周。Shpitto 将流程压缩到分钟级：描述业务，即可获得可交付的信息架构、文案、视觉建议和部署路径。",
      features: [
        {
          title: "理解你的业务逻辑",
          description: "不只是生成文字，还会提炼行业术语、业务流程和采购场景，输出更可信的页面内容。",
        },
        {
          title: "自动规划内容架构",
          description: "自动组合 Hero、产品模块、信任证明和询盘转化结构，并符合实用 SEO 习惯。",
        },
      ],
    },
    quality: {
      badge: "设计质量",
      title: "为专业视觉体验而设计",
      body: "Shpitto 不只是写代码，还会组织统一的间距、层级和转化交互，让页面更像完整产品。",
      learnMore: "了解更多",
      features: [
        { title: "自适应字体层级", description: "为长篇 B2B 页面优化字体组合和阅读层级。" },
        { title: "微交互反馈", description: "用克制动效表达速度和确定性，而不是制造干扰。" },
        { title: "协调配色", description: "在工业可信感和品牌温度之间取得平衡。" },
        { title: "响应式网格", description: "从手机到桌面预览都保持平滑适配。" },
      ],
    },
    blog: {
      badge: "最新洞察",
      title: "工业增长洞察与案例",
      viewAll: "查看全部文章",
      readArticle: "阅读文章",
      posts: [
        {
          title: "工业网站设计的未来：AI 驱动与数据优先",
          excerpt: "AI 正在改变制造企业建立数字化形象的方式，让网站从静态画册转向动态获客引擎。",
          category: "行业趋势",
        },
        {
          title: "案例：Apex Robotics 如何在 30 天内线索翻倍",
          excerpt: "拆解一家机器人创业公司如何用 Shpitto 重建网站，并提升转化效率。",
          category: "案例研究",
        },
        {
          title: "制造业 SEO：2026 年 5 个关键策略",
          excerpt: "传统 B2B SEO 正在失效，产品目录和内容结构需要适配语义搜索时代。",
          category: "增长策略",
        },
      ],
    },
    finalCta: {
      title: "准备更快上线？",
      body: "和更多工业企业一样，用 Shpitto 更快生成、预览和发布专业网站。无需信用卡。",
      button: "立即开始项目",
    },
    footer: {
      description: "专为工业领域打造的 AI 网站生成器。智能、快速、专业。",
      product: "产品",
      resources: "资源",
      company: "公司",
      copyright: "(c) 2026 Shpitto Inc. 保留所有权利。",
      links: {
        features: "功能",
        pricing: "价格",
        showcase: "案例",
        integrations: "集成",
        blog: "博客",
        documentation: "文档",
        community: "社区",
        helpCenter: "帮助中心",
        about: "关于我们",
        careers: "招聘",
        legal: "法律",
        contact: "联系",
        privacy: "隐私政策",
        terms: "服务条款",
      },
    },
    launch: {
      badge: "项目中心",
      title: "接下来想生成什么？",
      body: "从一次对话开始，继续最近项目，或使用已有模板快速启动。",
      pillars: [
        { title: "对话优先", desc: "用自然语言描述目标、限制和偏好。" },
        { title: "项目记忆", desc: "基于已保存上下文继续历史项目。" },
        { title: "模板加速", desc: "从验证过的工业网站结构开始。" },
      ],
      recentProjects: "最近项目",
      activeDrafts: "进行中的草稿",
      openInStudio: "在 Studio 中打开",
      emptyRecent: "还没有最近项目。开始一次对话创建第一个草稿。",
      recommendedTemplates: "推荐模板",
      curatedStyles: "精选风格",
      browseAll: "查看全部",
      useTemplate: "使用模板",
      composer: {
        label: "对话",
        defaultPrompt: "为我们的精密零部件业务生成一个干净、重视转化的网站。首屏突出技术证明，再按行业应用场景引导访客。",
        placeholder: "描述你想生成的项目...",
        chips: ["参考", "项目", "模板"],
        send: "发送",
        newProject: "新项目",
        createFailed: "创建项目失败。",
      },
    },
    login: {
      welcome: "欢迎回来",
      subtitle: "登录后继续生成你的项目。",
      google: "使用 Google 继续",
      divider: "或使用邮箱登录",
      email: "邮箱",
      password: "密码",
      passwordPlaceholder: "••••••••",
      signIn: "登录",
      forgotPassword: "忘记密码？",
      sendResetLink: "发送重置链接",
      backToSignIn: "返回登录",
      resetLinkSent: "如果该邮箱存在账号，密码重置链接将发送到邮箱。",
      noAccount: "还没有账号？",
      signUp: "注册",
      emailConfirmation: "请查看邮箱中的确认链接。",
      oauthMissing: "Supabase SDK 未返回 Google OAuth 地址。",
      oauthFailed: "无法打开 Google OAuth",
      legal: "继续即表示你同意 Shpitto 的服务条款和隐私政策。",
    },
  },
};

export function getLandingCopy(locale: Locale): LandingCopy {
  return landingCopy[locale] || landingCopy[DEFAULT_LOCALE];
}
