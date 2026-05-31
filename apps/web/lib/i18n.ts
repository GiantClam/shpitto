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
      badge: "For Export B2B Teams",
      headline: "Build a professional export website",
      highlight: "for your B2B business with AI.",
      body: "Create company pages, product pages, and SEO-friendly content for overseas buyers without starting from a blank page. Built for manufacturers, trading companies, and industrial suppliers.",
      cta: "Start with a Sample Website",
      demo: "See Example Websites",
      stats: [
        { value: "Export", label: "B2B-ready positioning" },
        { value: "SEO", label: "Structured page system" },
        { value: "Multi-language", label: "Content support" },
      ],
      promptPlaceholder: "Build a multilingual manufacturer website for overseas buyers in Europe and North America...",
    },
    efficiency: {
      metricLabel: "Launch faster",
      metricValue: "Without a full web team",
      badge: "Built for Export Teams",
      title: "Create the pages overseas buyers expect.",
      highlight: "Without rebuilding your process.",
      body: "Describe your company, products, and target markets. Shpitto shapes the page structure, drafts professional English copy, and helps you launch a website that is easier to maintain as your export business grows.",
      features: [
        {
          title: "Right-Fit Use Cases",
          description: "Designed for manufacturer websites, trading company websites, industrial supplier profiles, and inquiry-ready export websites instead of generic creator pages.",
        },
        {
          title: "Pages You Can Generate",
          description: "Create homepage, about, product, application, FAQ, and contact pages with a structure that supports SEO, credibility, and buyer inquiries.",
        },
      ],
    },
    quality: {
      badge: "Why Shpitto",
      title: "Structured for credibility, SEO, and ongoing updates",
      body: "Shpitto helps traditional B2B teams publish clear company websites, organize product and industry content, and keep improving the site after launch without losing consistency.",
      learnMore: "Built for industrial selling",
      features: [
        { title: "SEO-Friendly Structure", description: "Build company pages, product pages, and industry pages around clear headings, search intent, and future AI-readable content patterns." },
        { title: "Multilingual Content", description: "Prepare English-first export content and expand into multilingual business websites as new markets and distributors come online." },
        { title: "Natural-Language Updates", description: "Update product details, company strengths, and market messaging with plain instructions instead of reworking pages from scratch." },
        { title: "Post-Launch Visibility", description: "Keep track of visits and inquiry signals after launch so your export website becomes an active sales asset, not a static brochure." },
      ],
    },
    blog: {
      badge: "Export Website Guides",
      title: "Practical content for manufacturers and trading companies",
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
      title: "Ready to turn your company profile into an export website?",
      body: "Start with your company, product, and market information. Shpitto helps you shape a professional website you can refine as your business expands.",
      button: "Start with a Sample Website",
    },
    footer: {
      description: "An AI website builder for manufacturers, trading companies, and export-oriented B2B teams that need professional, SEO-friendly company websites.",
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
      badge: "面向出海 B2B 团队",
      headline: "用 AI 为你的 B2B 业务搭建专业出口官网",
      highlight: "",
      body: "围绕海外买家需求，快速生成公司页、产品页和 SEO 友好内容，不再从空白页面开始。适合制造企业、贸易公司和工业供应商。",
      cta: "从样例网站开始",
      demo: "查看样站",
      stats: [
        { value: "出口", label: "面向 B2B 的定位表达" },
        { value: "SEO", label: "结构化页面体系" },
        { value: "多语言", label: "支持后续扩展" },
      ],
      promptPlaceholder: "帮我搭建一个面向欧洲和北美买家的多语言制造企业官网...",
    },
    efficiency: {
      metricLabel: "上线更快",
      metricValue: "不必组完整网站团队",
      badge: "为出海团队而设计",
      title: "生成海外买家真正会看的页面。",
      highlight: "不必重做你现有的业务流程。",
      body: "告诉 Shpitto 你的公司、产品和目标市场，它会帮你组织页面结构、起草更专业的英文内容，并把网站做成一个后续更容易持续维护的出口官网。",
      features: [
        {
          title: "更匹配的应用场景",
          description: "重点面向制造企业官网、贸易公司官网、工业供应商展示站和询盘型出口网站，而不是泛化的创作者站点。",
        },
        {
          title: "可直接生成的页面",
          description: "支持首页、关于我们、产品页、应用页、FAQ 和联系页，让内容结构更利于 SEO、信任建立和询盘转化。",
        },
      ],
    },
    quality: {
      badge: "为什么选择 Shpitto",
      title: "为可信度、SEO 和持续迭代而设计",
      body: "Shpitto 帮助传统 B2B 团队发布更清晰的公司官网，组织产品与行业内容，并在上线后继续更新网站而不丢失整体一致性。",
      learnMore: "更适合工业品出海销售",
      features: [
        { title: "SEO 友好结构", description: "围绕公司页、产品页和行业应用页组织内容，让标题层级、搜索意图和未来 AI 可读性更清晰。" },
        { title: "多语言内容扩展", description: "先建立英文出口内容，再随着新市场和分销渠道扩展到更多语言版本。" },
        { title: "自然语言更新", description: "用普通语言持续修改产品信息、公司优势和市场表达，而不是每次都重做页面。" },
        { title: "上线后的可见性", description: "持续观察访问和询盘信号，让官网成为销售资产，而不是一份静态电子宣传册。" },
      ],
    },
    blog: {
      badge: "出口官网指南",
      title: "给制造企业和贸易公司的实战内容",
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
      title: "准备把公司资料整理成真正能出海获客的官网了吗？",
      body: "从公司信息、产品资料和目标市场开始。Shpitto 帮你先搭出一个专业网站，再随着业务扩展持续优化。",
      button: "从样例网站开始",
    },
    footer: {
      description: "一个面向制造企业、贸易公司和出海 B2B 团队的 AI 官网搭建工具，帮助你更快建立专业、SEO 友好的公司网站。",
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
      title: "接下来你想搭建什么？",
      body: "从一段需求描述开始，继续已有项目，或直接使用适合工业品出海的模板启动。",
      pillars: [
        { title: "对话优先", desc: "用自然语言描述目标、限制条件和偏好。" },
        { title: "项目记忆", desc: "基于已保存上下文继续已有项目。" },
        { title: "模板加速", desc: "从经过验证的工业品网站结构开始。" },
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
        defaultPrompt: "帮我们搭建一个适合精密零部件业务的官网。首屏突出技术实力和信任证明，再按行业应用引导访客进入对应页面。",
        placeholder: "描述你想搭建的项目...",
        chips: ["参考", "项目", "模板"],
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
