import type { Locale } from "@/lib/i18n";

export type ProjectWorkspaceCopy = {
  back: string;
  noProjects: string;
  selectProject: string;
  currentProject: string;
  newProject: string;
  guest: string;
  signOut: string;
  expandSidebar: string;
  collapseSidebar: string;
  nav: {
    chat: string;
    analytics: string;
    assets: string;
    data: string;
    settings: string;
  };
  chat: {
    attach: string;
    addFiles: string;
    uploadLocal: string;
    close: string;
    searchAssets: string;
    loadingAssets: string;
    noAssets: string;
    added: string;
    add: string;
    promptPlaceholder: (projectTitle: string) => string;
    send: string;
    sendHint: string;
    syncing: string;
    preview: string;
    openFullscreen: string;
    generatedPreview: string;
  };
  assets: {
    title: string;
    uploadFiles: string;
    downloadAll: string;
    downloading: string;
    all: string;
    images: string;
    code: string;
    documents: string;
    search: string;
    loading: string;
    empty: string;
    unauthorized: string;
    open: string;
    openChat: string;
    deleteAsset: string;
    sourceGenerated: string;
    sourceChatUpload: string;
    sourceUpload: string;
    categoryImage: string;
    categoryCode: string;
    categoryDocument: string;
    categoryOther: string;
    statusPublished: string;
    statusUpdated: string;
    statusNew: string;
  };
  analytics: {
    title: string;
    openLiveSite: string;
    refresh: string;
    visits: string;
    pageViews: string;
    bounceRate: string;
    avgDuration: string;
    last7Days: string;
    last30Days: string;
    topPages: string;
    trafficChannels: string;
  };
  data: {
    title: string;
    inquiries: string;
    authUsers?: string;
    blog?: string;
    searchInquiries: string;
    searchUsers?: string;
    exportCsv: string;
    exporting: string;
    loadingInquiries: string;
    loadingUsers?: string;
    noMatchingInquiries: string;
    noInquiries: string;
    noMatchingUsers?: string;
    noUsers?: string;
    date: string;
    customerName: string;
    emailAddress: string;
    verified?: string;
    firstSeen?: string;
    lastSeen?: string;
    lastEvent?: string;
    authUserId?: string;
    siteKey?: string;
    signupCount?: string;
    loginCount?: string;
    verificationCount?: string;
    passwordResetCount?: string;
    subject: string;
    status: string;
    action: string;
    viewDetails: string;
    detailsTitle: string;
    selectInquiry: string;
    detailsTitleUsers?: string;
    selectUser?: string;
    quickActions: string;
  };
};

const copy: Record<Locale, ProjectWorkspaceCopy> = {
  en: {
    back: "Back",
    noProjects: "No projects",
    selectProject: "Select project",
    currentProject: "Current Project",
    newProject: "New Project",
    guest: "Guest",
    signOut: "Sign out",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    nav: {
      chat: "Chat",
      analytics: "Analytics",
      assets: "Assets",
      data: "Data",
      settings: "Settings",
    },
    chat: {
      attach: "Attach",
      addFiles: "Add Files To Chat",
      uploadLocal: "Upload Local",
      close: "Close",
      searchAssets: "Search existing assets...",
      loadingAssets: "Loading assets...",
      noAssets: "No matching assets. Upload local files to continue.",
      added: "Added",
      add: "Add",
      promptPlaceholder: (projectTitle) => `Describe changes for ${projectTitle}...`,
      send: "Send",
      sendHint: "Press Enter to send, Shift+Enter for new line.",
      syncing: "Syncing task progress...",
      preview: "Preview",
      openFullscreen: "Open preview in fullscreen",
      generatedPreview: "Generated Website Preview",
    },
    assets: {
      title: "Project Assets",
      uploadFiles: "Upload Files",
      downloadAll: "Download All",
      downloading: "Downloading...",
      all: "All",
      images: "Images",
      code: "Code",
      documents: "Documents",
      search: "Search assets...",
      loading: "Loading assets...",
      empty: "No assets yet. Upload files or generate website files from chat.",
      unauthorized: "Sign in to view and manage assets.",
      open: "Open",
      openChat: "Open Chat",
      deleteAsset: "Delete asset",
      sourceGenerated: "Generated",
      sourceChatUpload: "Chat Upload",
      sourceUpload: "Upload",
      categoryImage: "Image",
      categoryCode: "Code",
      categoryDocument: "Document",
      categoryOther: "Other",
      statusPublished: "Published",
      statusUpdated: "Updated",
      statusNew: "New",
    },
    analytics: {
      title: "Project Analysis",
      openLiveSite: "Open Live Site",
      refresh: "Refresh",
      visits: "Visits",
      pageViews: "Page Views",
      bounceRate: "Bounce Rate",
      avgDuration: "Avg Duration",
      last7Days: "Last 7 days",
      last30Days: "Last 30 days",
      topPages: "Top Pages",
      trafficChannels: "Traffic Channels",
    },
    data: {
      title: "Project Data Hub",
      inquiries: "Inquiries",
      authUsers: "Auth Users",
      blog: "Blog",
      searchInquiries: "Search inquiries...",
      searchUsers: "Search auth users...",
      exportCsv: "Export CSV",
      exporting: "Exporting...",
      loadingInquiries: "Loading inquiry data...",
      loadingUsers: "Loading auth user data...",
      noMatchingInquiries: "No matching inquiries found.",
      noInquiries: "No inquiry submissions yet.",
      noMatchingUsers: "No matching auth users found.",
      noUsers: "No auth users yet.",
      date: "Date",
      customerName: "Customer Name",
      emailAddress: "Email Address",
      verified: "Verified",
      firstSeen: "First Seen",
      lastSeen: "Last Seen",
      lastEvent: "Last Event",
      authUserId: "Auth User ID",
      siteKey: "Site Key",
      signupCount: "Signups",
      loginCount: "Logins",
      verificationCount: "Verifications",
      passwordResetCount: "Password Resets",
      subject: "Subject",
      status: "Status",
      action: "Action",
      viewDetails: "View details",
      detailsTitle: "Detailed Selection View",
      selectInquiry: "Select a row from the table above to inspect full inquiry details.",
      detailsTitleUsers: "Auth User Details",
      selectUser: "Select an auth user row to inspect the account record.",
      quickActions: "Quick Actions",
    },
  },
  zh: {
    back: "返回",
    noProjects: "暂无项目",
    selectProject: "选择项目",
    currentProject: "当前项目",
    newProject: "新建项目",
    guest: "访客",
    signOut: "退出登录",
    expandSidebar: "展开侧边栏",
    collapseSidebar: "收起侧边栏",
    nav: {
      chat: "对话",
      analytics: "分析",
      assets: "资源",
      data: "数据",
      settings: "设置",
    },
    chat: {
      attach: "添加附件",
      addFiles: "添加文件到对话",
      uploadLocal: "上传本地文件",
      close: "关闭",
      searchAssets: "搜索已有资源...",
      loadingAssets: "正在加载资源...",
      noAssets: "没有匹配资源。上传本地文件后继续。",
      added: "已添加",
      add: "添加",
      promptPlaceholder: (projectTitle) => `描述对 ${projectTitle} 的修改...`,
      send: "发送",
      sendHint: "按 Enter 发送，Shift+Enter 换行。",
      syncing: "正在同步任务进度...",
      preview: "预览",
      openFullscreen: "全屏打开预览",
      generatedPreview: "生成网站预览",
    },
    assets: {
      title: "项目资源",
      uploadFiles: "上传文件",
      downloadAll: "一键下载",
      downloading: "正在下载...",
      all: "全部",
      images: "图片",
      code: "代码",
      documents: "文档",
      search: "搜索资源...",
      loading: "正在加载资源...",
      empty: "暂无资源。可以上传文件，或从对话生成网站文件。",
      unauthorized: "登录后可查看和管理资源。",
      open: "打开",
      openChat: "打开对话",
      deleteAsset: "删除资源",
      sourceGenerated: "生成",
      sourceChatUpload: "对话上传",
      sourceUpload: "上传",
      categoryImage: "图片",
      categoryCode: "代码",
      categoryDocument: "文档",
      categoryOther: "其他",
      statusPublished: "已发布",
      statusUpdated: "已更新",
      statusNew: "新增",
    },
    analytics: {
      title: "项目分析",
      openLiveSite: "打开线上网站",
      refresh: "刷新",
      visits: "访问",
      pageViews: "浏览量",
      bounceRate: "跳出率",
      avgDuration: "平均停留",
      last7Days: "最近 7 天",
      last30Days: "最近 30 天",
      topPages: "热门页面",
      trafficChannels: "流量渠道",
    },
    data: {
      title: "项目数据中心",
      inquiries: "询盘",
      authUsers: "认证用户",
      blog: "博客",
      searchInquiries: "搜索询盘...",
      searchUsers: "搜索认证用户...",
      exportCsv: "导出 CSV",
      exporting: "正在导出...",
      loadingInquiries: "正在加载询盘数据...",
      loadingUsers: "正在加载认证用户数据...",
      noMatchingInquiries: "没有匹配的询盘。",
      noInquiries: "暂无询盘提交。",
      noMatchingUsers: "没有匹配的认证用户。",
      noUsers: "暂无认证用户。",
      date: "日期",
      customerName: "客户姓名",
      emailAddress: "邮箱地址",
      verified: "已验证",
      firstSeen: "首次出现",
      lastSeen: "最近出现",
      lastEvent: "最近事件",
      authUserId: "认证用户 ID",
      siteKey: "站点 Key",
      signupCount: "注册数",
      loginCount: "登录数",
      verificationCount: "验证数",
      passwordResetCount: "重置密码数",
      subject: "主题",
      status: "状态",
      action: "操作",
      viewDetails: "查看详情",
      detailsTitle: "详细信息",
      selectInquiry: "从上方表格选择一行，查看完整询盘详情。",
      detailsTitleUsers: "认证用户详情",
      selectUser: "从上方表格选择一行，查看账号记录。",
      quickActions: "快捷操作",
    },
  },
};

export function getProjectWorkspaceCopy(locale: Locale): ProjectWorkspaceCopy {
  return copy[locale] || copy.en;
}
