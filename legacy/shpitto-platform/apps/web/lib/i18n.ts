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
    pricing: string;
    useCases: string;
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
      templateLabel: string;
      workflowLabel: string;
      workflows: Array<{ id: string; title: string; description: string }>;
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
      projects: "Launch Center",
      features: "Features",
      showcase: "Why Shpitto",
      pricing: "Pricing",
      useCases: "Use Cases",
      blog: "Blog",
      login: "Log in",
      getStarted: "Start Building",
      accountPassword: "Password",
      signOut: "Sign out",
    },
    hero: {
      badge: "Agent-Native Website Templates",
      headline: "Launch a marketing website",
      highlight: "with code you own and workflows you reuse.",
      body: "Choose a template, pick a result-driven workflow, and generate a launch-ready website baseline you can export, deploy, and keep iterating with AI.",
      cta: "Start in Launch Center",
      demo: "Browse Template Directions",
      stats: [
        { value: "Templates", label: "Launch-ready baselines" },
        { value: "Skills", label: "Result-driven workflows" },
        { value: "Code ownership", label: "Export and deploy" },
      ],
      promptPlaceholder: "Build a launch-ready site for our AI workflow product with workflow proof, pricing, docs, and clear CTAs...",
    },
    efficiency: {
      metricLabel: "Ship the baseline",
      metricValue: "Without rebuilding your stack",
      badge: "Template + Workflow Runtime",
      title: "Move from idea to",
      highlight: "a complete website baseline.",
      body: "Start from curated templates, route the request through a result-oriented skill, and get a complete Next.js website baseline that is ready for export, deployment, and follow-up refinement.",
      features: [
        {
          title: "Pick the right workflow",
          description: "Use focused entry skills such as marketing-site and B2B-site instead of a generic chat-to-site promise.",
        },
        {
          title: "Generate a full baseline",
          description: "Produce homepage, supporting routes, shared shell, and deploy-ready code instead of a single-page demo.",
        },
      ],
    },
    quality: {
      badge: "Why This V1",
      title: "Templates, delivery, and runtime stay aligned",
      body: "Shpitto V1 is not a hosted website lock-in product. It is a template platform that combines reusable code baselines, contract-driven agent skills, and a deployment-ready delivery path.",
      learnMore: "Designed for deliverability",
      features: [
        { title: "Code Ownership", description: "Keep the generated Next.js codebase, export it, deploy it, and continue iterating outside the platform." },
        { title: "Template SKU Focus", description: "Curated launch templates let V1 sell a clear product instead of claiming to build every possible website from scratch." },
        { title: "Agent Skills", description: "Skills define inputs, structure, and quality bars so generation behaves like a workflow, not an improvisation." },
        { title: "Post-Launch Workflows", description: "Continue with content, SEO, and marketing refinements after the baseline site goes live." },
      ],
    },
    blog: {
      badge: "Launch Guides",
      title: "Guides for templates, export sites, and post-launch growth",
      viewAll: "View All Articles",
      readArticle: "Read Article",
      posts: [
        {
          title: "How manufacturers can build an SEO-friendly export website",
          excerpt: "A practical homepage, product page, and trust-content framework for industrial companies selling to overseas buyers.",
          category: "Manufacturer Website",
        },
        {
          title: "What a trading company homepage should include",
          excerpt: "Learn how to position sourcing strength, product range, and inquiry paths without sounding like a generic brochure site.",
          category: "Trading Company Website",
        },
        {
          title: "How to structure product pages for overseas buyers",
          excerpt: "Turn specifications, applications, and buyer questions into product pages that support SEO and faster inquiry conversion.",
          category: "Product Catalog Website",
        },
      ],
    },
    finalCta: {
      title: "Ready to ship the first version of your launch site?",
      body: "Start from a template, choose the right workflow, and generate code you can keep deploying after the first release.",
      button: "Open Launch Center",
    },
    footer: {
      description: "An agent-native marketing website template platform with reusable code, result-driven skills, and deployment-ready delivery.",
      product: "Product",
      resources: "Resources",
      company: "Company",
      copyright: "(c) 2026 Shpitto. All rights reserved.",
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
        acceptableUse: "Acceptable Use",
      },
    },
    launch: {
      badge: "Launch Center",
      title: "Pick a template. Choose a workflow. Ship code you own.",
      body: "Start from a launch-ready template baseline, route it through the right workflow, and continue from recent projects when you need another iteration.",
      pillars: [
        { title: "Template-first", desc: "Bootstrap from curated site baselines instead of a blank prompt." },
        { title: "Workflow-driven", desc: "Choose a result-oriented skill that matches the site you want to ship." },
        { title: "Code you own", desc: "Generate deployable code you can export, host, and refine later." },
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
        defaultPrompt: "Build a clean, conversion-focused marketing site for our AI workflow product. Keep the hero outcome-led, show reusable workflow proof, and end with launch-ready CTAs.",
        placeholder: "Describe the project you want to build...",
        chips: ["Reference", "Project", "Template"],
        templateLabel: "Template",
        workflowLabel: "Workflow",
        workflows: [
          {
            id: "build-ai-image-tool",
            title: "AI Image Tool",
            description: "Launch a product-shaped AI image tool baseline with generator, gallery, pricing, FAQ, and plugin-ready surfaces.",
          },
          {
            id: "build-marketing-site",
            title: "Marketing Site",
            description: "Launch a conversion-first template baseline for SaaS, AI products, and campaigns.",
          },
          {
            id: "build-b2b-site",
            title: "B2B Site",
            description: "Generate an inquiry-ready company website for manufacturers, suppliers, and service teams.",
          },
        ],
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
      legal: "By continuing, you agree to Shpitto's Terms of Service, Privacy Policy, and Acceptable Use Policy.",
    },
  },
  zh: {
    nav: {
      projects: "启动中心",
      features: "核心能力",
      showcase: "为什么选择 Shpitto",
      pricing: "价格",
      useCases: "适用场景",
      blog: "博客",
      login: "登录",
      getStarted: "开始搭建",
      accountPassword: "修改密码",
      signOut: "退出登录",
    },
    hero: {
      badge: "Agent-Native 网站模板",
      headline: "生成一个可上线的营销网站",
      highlight: "代码归你，工作流可复用。",
      body: "选择模板、选择结果型工作流，生成一个可导出、可部署、可继续迭代的 Next.js 网站基线，而不是只得到一个单页演示。",
      cta: "进入 Launch Center",
      demo: "查看模板方向",
      stats: [
        { value: "模板", label: "可直接启动的基线" },
        { value: "Skills", label: "结果型工作流入口" },
        { value: "代码所有权", label: "导出并部署" },
      ],
      promptPlaceholder: "帮我搭建一个 AI 工作流产品的营销站，突出核心价值、工作流证明、价格和清晰 CTA...",
    },
    efficiency: {
      metricLabel: "先上线基线",
      metricValue: "不用先重造整套系统",
      badge: "模板 + 工作流执行",
      title: "从需求走到",
      highlight: "完整网站基线。",
      body: "从模板基线开始，经过结果型 Skill 的约束生成，拿到一个可导出、可部署、可继续微调的 Next.js 网站工程。",
      features: [
        {
          title: "先选对工作流",
          description: "通过 marketing-site、b2b-site 等入口进入，而不是继续强调一个泛化的聊天建站器。",
        },
        {
          title: "直接生成完整基线",
          description: "产出首页、内页、共享 shell 和可部署代码，而不是只生成一个首页 demo。",
        },
      ],
    },
    quality: {
      badge: "为什么这个 V1 成立",
      title: "模板、交付和 runtime 终于在一条线上",
      body: "Shpitto V1 不是托管式锁定平台，而是一个结合模板代码、合同驱动 Skills 和可部署交付路径的网站模板产品。",
      learnMore: "围绕可交付性设计",
      features: [
        { title: "代码所有权", description: "生成后的 Next.js 工程可以导出、部署，也可以脱离平台继续维护。" },
        { title: "模板 SKU 清晰", description: "V1 卖的是清晰模板和工作流，而不是声称能从零做任何网站。" },
        { title: "Agent Skills 约束", description: "通过 Skill 定义输入、结构和质量门槛，让生成更像产品工作流而不是自由发挥。" },
        { title: "上线后工作流", description: "网站上线后还可以继续做内容、SEO 和营销自动化迭代。" },
      ],
    },
    blog: {
      badge: "上线指南",
      title: "围绕模板交付、出口官网和上线后增长的内容",
      viewAll: "查看全部文章",
      readArticle: "阅读文章",
      posts: [
        {
          title: "制造企业如何搭建 SEO 友好的出口官网",
          excerpt: "从首页定位、产品页到信任内容，梳理工业企业面向海外买家的官网结构。",
          category: "制造企业官网",
        },
        {
          title: "贸易公司首页应该包含什么内容",
          excerpt: "学会如何更清晰地展示采购能力、产品范围和询盘路径，而不是写成泛泛的宣传页。",
          category: "贸易公司官网",
        },
        {
          title: "如何为海外买家组织产品页面",
          excerpt: "把规格、应用场景和买家问题整理成更利于 SEO 和询盘转化的产品页。",
          category: "产品目录网站",
        },
      ],
    },
    finalCta: {
      title: "准备好发布你的网站 V1 了吗？",
      body: "从模板开始，选择工作流，然后拿到一套可以继续部署和迭代的代码基线。",
      button: "打开 Launch Center",
    },
    footer: {
      description: "一个面向开发者、独立创业者和 AI maker 的 agent-native 网站模板平台，提供可拥有的代码、结果型 Skills 和可部署交付能力。",
      product: "产品",
      resources: "资源",
      company: "公司",
      copyright: "(c) 2026 Shpitto. 保留所有权利。",
      links: {
        features: "核心能力",
        pricing: "价格",
        showcase: "案例方向",
        integrations: "素材管理",
        blog: "博客",
        documentation: "文档",
        community: "社区",
        helpCenter: "帮助中心",
        about: "关于我们",
        careers: "招聘",
        legal: "法律信息",
        contact: "联系我们",
        privacy: "隐私政策",
        terms: "服务条款",
        acceptableUse: "可接受使用政策",
      },
    },
    launch: {
      badge: "启动中心",
      title: "先选模板，再选工作流，最后拿走你的代码。",
      body: "从可上线的模板基线开始，选择合适的工作流，再继续迭代最近的项目版本。",
      pillars: [
        { title: "模板优先", desc: "不从空白 prompt 开始，而是从可交付的基线模板启动。" },
        { title: "工作流驱动", desc: "先选结果型 Skill，再进入生成链路。" },
        { title: "代码可拥有", desc: "生成后可以导出、部署，并继续在外部维护。" },
      ],
      recentProjects: "最近项目",
      activeDrafts: "进行中的草稿",
      openInStudio: "在 Studio 中打开",
      emptyRecent: "还没有最近项目。开始一段对话来创建你的第一个草稿。",
      recommendedTemplates: "推荐模板",
      curatedStyles: "精选风格",
      browseAll: "查看全部",
      useTemplate: "使用模板",
      composer: {
        label: "对话",
        defaultPrompt: "帮我搭建一个面向 AI 产品发布的营销站，首页突出核心价值、工作流复用能力和清晰 CTA。",
        placeholder: "描述你想搭建的项目...",
        chips: ["参考", "项目", "模板"],
        templateLabel: "模板",
        workflowLabel: "工作流",
        workflows: [
          {
            id: "build-ai-image-tool",
            title: "AI 图片工具",
            description: "生成包含生成器、作品库、定价、FAQ 和插件预留结构的产品型 AI 图片工具基线。",
          },
          {
            id: "build-marketing-site",
            title: "营销站",
            description: "生成适合 SaaS、AI 产品和活动页的转化型模板基线。",
          },
          {
            id: "build-b2b-site",
            title: "B2B 官网",
            description: "生成适合制造商、供应商和服务团队的询盘型公司官网。",
          },
        ],
        send: "发送",
        newProject: "新项目",
        createFailed: "创建项目失败。",
      },
    },
    login: {
      welcome: "欢迎回来",
      subtitle: "登录后继续搭建你的项目。",
      google: "使用 Google 继续",
      divider: "或使用邮箱登录",
      email: "邮箱",
      password: "密码",
      passwordPlaceholder: "••••••••",
      signIn: "登录",
      forgotPassword: "忘记密码？",
      sendResetLink: "发送重置链接",
      backToSignIn: "返回登录",
      resetLinkSent: "如果该邮箱存在账号，密码重置链接将会发送到邮箱。",
      noAccount: "还没有账号？",
      signUp: "注册",
      emailConfirmation: "请查看邮箱中的确认链接。",
      oauthMissing: "Supabase SDK 没有返回 Google OAuth 地址。",
      oauthFailed: "无法打开 Google OAuth",
      legal: "继续即表示你同意 Shpitto 的服务条款、隐私政策和可接受使用政策。",
    },
  },
};

export function getLandingCopy(locale: Locale): LandingCopy {
  return landingCopy[locale] || landingCopy[DEFAULT_LOCALE];
}
