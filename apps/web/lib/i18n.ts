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
      projects: "Workspace",
      features: "Features",
      showcase: "Showcase",
      blog: "Blog",
      login: "Log in",
      getStarted: "Get Started",
      accountPassword: "Password",
      signOut: "Sign out",
    },
    hero: {
      badge: "AI Website Studio",
      headline: "Launch blogs and business sites",
      highlight: "from one prompt.",
      body: "Shpitto helps creators and teams generate multi-style blogs, company websites, landing pages, and AI tool sites, then deploy, manage assets, and watch performance in one workspace.",
      cta: "Generate My Website",
      demo: "Watch Demo",
      stats: [
        { value: "5+", label: "Site types" },
        { value: "1-click", label: "Deploy flow" },
        { value: "Live", label: "Data visibility" },
      ],
      promptPlaceholder: "Build a minimalist bilingual blog for my AI notes...",
    },
    efficiency: {
      metricLabel: "From prompt to live",
      metricValue: "One flow",
      badge: "Generate + Deploy",
      title: "From idea to live site.",
      highlight: "Without stitching tools together.",
      body: "Describe the site you need and Shpitto plans the pages, drafts copy, builds the preview, and prepares deployment. Your project keeps the generated files, uploaded assets, and operational context together.",
      features: [
        {
          title: "Multiple Website Types",
          description: "Create personal blogs, company websites, product landing pages, AI tool sites, portfolios, and content hubs from the same conversation-first workflow.",
        },
        {
          title: "One-Click Publishing Path",
          description: "Move from generated preview to deployed website with a guided release path, instead of manually copying code between generators, storage, and hosting tools.",
        },
      ],
    },
    quality: {
      badge: "Operate After Launch",
      title: "A website workspace, not just a generator",
      body: "Shpitto keeps the generated site useful after launch: manage resources, iterate pages, and see website data without leaving the project.",
      learnMore: "Learn more",
      features: [
        { title: "Style Variety", description: "Choose from crisp editorial blogs, polished company sites, launch pages, portfolios, and tool directories without locking into one template look." },
        { title: "Resource Management", description: "Keep logos, images, documents, generated files, and reference materials attached to the project for reuse." },
        { title: "Realtime Data", description: "Track visits, trends, inquiries, and content performance so the website becomes measurable after it goes live." },
        { title: "Iterative Studio", description: "Refine copy, layout, assets, and deployment details from the same chat-driven workspace." },
      ],
    },
    blog: {
      badge: "Website Playbooks",
      title: "Ideas for creators, teams, and solo builders",
      viewAll: "View All Articles",
      readArticle: "Read Article",
      posts: [
        {
          title: "How to turn a personal knowledge base into a publishable blog",
          excerpt: "A practical path from scattered notes to a structured, searchable blog with a consistent visual identity.",
          category: "Personal Blog",
        },
        {
          title: "The small-company website stack: generate, deploy, measure",
          excerpt: "Why modern company sites need generation, hosting, resource management, and analytics in one operating loop.",
          category: "Company Site",
        },
        {
          title: "Launching an AI tool site without building a CMS first",
          excerpt: "Use a generated landing page, resource library, and visible data to validate demand before overbuilding.",
          category: "AI Tool Site",
        },
      ],
    },
    finalCta: {
      title: "Ready to turn one idea into a live website?",
      body: "Generate a blog, company website, landing page, or AI tool site, then deploy it and keep managing it from the same workspace.",
      button: "Generate My Website",
    },
    footer: {
      description: "An AI website generation and operations workspace for blogs, company sites, landing pages, and AI tools.",
      product: "Product",
      resources: "Resources",
      company: "Company",
      copyright: "(c) 2026 Shpitto Inc. All rights reserved.",
      links: {
        features: "Features",
        pricing: "Pricing",
        showcase: "Showcase",
        integrations: "Assets",
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
      projects: "工作台",
      features: "功能",
      showcase: "案例",
      blog: "博客",
      login: "登录",
      getStarted: "开始使用",
      accountPassword: "修改密码",
      signOut: "退出登录",
    },
    hero: {
      badge: "AI 网站工作台",
      headline: "一句话生成 Blog 和企业网站",
      highlight: "并直接上线运营。",
      body: "Shpitto 帮个人和团队生成多风格 Blog、企业官网、产品落地页和 AI 工具站，并在同一个工作台完成部署、资源管理和数据查看。",
      cta: "生成我的网站",
      demo: "观看演示",
      stats: [
        { value: "5+", label: "网站类型" },
        { value: "一键", label: "部署流程" },
        { value: "实时", label: "数据可见" },
      ],
      promptPlaceholder: "帮我生成一个极简中英双语 AI 笔记 Blog...",
    },
    efficiency: {
      metricLabel: "从想法到上线",
      metricValue: "一条流程",
      badge: "生成 + 部署",
      title: "从想法到上线网站。",
      highlight: "不用在多个工具之间来回拼接。",
      body: "描述你想要的网站，Shpitto 会规划页面、生成文案、构建预览并准备部署。项目会持续保存生成文件、上传资源和运营上下文。",
      features: [
        {
          title: "覆盖多种网站类型",
          description: "个人 Blog、企业官网、产品落地页、AI 工具站、作品集和内容站，都可以从同一套对话式流程生成。",
        },
        {
          title: "一键发布路径",
          description: "从生成预览到部署上线都有明确路径，不需要手动在代码生成器、素材存储和托管平台之间搬运。",
        },
      ],
    },
    quality: {
      badge: "上线后继续运营",
      title: "不只是生成器，而是网站工作台",
      body: "Shpitto 让网站上线后仍然可管理：资源可整理、页面可迭代、访问和转化数据可实时查看。",
      learnMore: "了解更多",
      features: [
        { title: "多种视觉风格", description: "可以生成内容型 Blog、专业企业官网、发布页、作品集和工具目录，而不是固定一种模板风格。" },
        { title: "资源管理", description: "Logo、图片、文档、生成文件和参考资料都可以跟随项目保存，后续继续复用。" },
        { title: "实时数据", description: "查看访问、趋势、询盘和内容表现，让网站上线后变得可衡量。" },
        { title: "持续迭代", description: "通过同一个对话工作台继续调整文案、布局、素材和部署细节。" },
      ],
    },
    blog: {
      badge: "建站方法",
      title: "给创作者、团队和独立开发者的建站思路",
      viewAll: "查看全部文章",
      readArticle: "阅读文章",
      posts: [
        {
          title: "如何把个人知识库变成可发布的 Blog",
          excerpt: "从零散笔记到结构清晰、可搜索、风格统一的个人内容站。",
          category: "个人 Blog",
        },
        {
          title: "小团队官网的新流程：生成、部署、看数据",
          excerpt: "现代企业官网不只是一组页面，还需要托管、资源管理和数据反馈形成闭环。",
          category: "企业官网",
        },
        {
          title: "不用先搭 CMS，也能快速发布 AI 工具站",
          excerpt: "先用生成落地页、资源管理和数据反馈验证需求，再决定是否继续重投入。",
          category: "AI 工具站",
        },
      ],
    },
    finalCta: {
      title: "准备把一个想法变成可上线网站？",
      body: "生成 Blog、企业官网、落地页或 AI 工具站，并在同一个工作台完成部署、资源管理和数据查看。",
      button: "生成我的网站",
    },
    footer: {
      description: "面向个人 Blog、企业官网、落地页和 AI 工具站的 AI 网站生成与运营工作台。",
      product: "产品",
      resources: "资源",
      company: "公司",
      copyright: "(c) 2026 Shpitto Inc. 保留所有权利。",
      links: {
        features: "功能",
        pricing: "价格",
        showcase: "案例",
        integrations: "资源管理",
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
