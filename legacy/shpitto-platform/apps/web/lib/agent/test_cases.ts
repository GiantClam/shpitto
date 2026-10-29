export const TEST_PROJECT_LuxeWeave = {
  projectId: "luxe-weave-global",
  branding: {
    name: "LuxeWeave Global",
    colors: {
      primary: "#0f172a",
      accent: "#2563eb"
    },
    style: {
      borderRadius: "lg",
      typography: "Inter"
    }
  },
  pages: [
    {
      path: "/",
      seo: {
        title: "LuxeWeave | Premium Industrial Textiles",
        description: "Leading manufacturer of high-performance industrial fabrics for global markets."
      },
      puckData: {
        content: [
          {
            id: "hero-1",
            type: "Hero",
            props: {
              title: "Crafting the Future of Industrial Textiles",
              description: "High-performance fabrics engineered for durability, safety, and sustainability.",
              ctaText: "Explore Products",
              theme: "dark",
              effect: "retro-grid"
            }
          },
          {
            id: "stats-1",
            type: "Stats",
            props: {
              items: [
                { label: "Years Excellence", value: "25", suffix: "+" },
                { label: "Global Clients", value: "1.2", suffix: "k" },
                { label: "Certifications", value: "15", suffix: "" }
              ]
            }
          },
          {
            id: "products-1",
            type: "ProductPreview",
            props: {
              title: "Our Specialized Solutions",
              items: [
                { 
                  title: "Aero-Grade Synthetics", 
                  description: "Ultra-lightweight materials for aerospace applications.",
                  image: "https://images.unsplash.com/photo-1559064515-52425020f899",
                  tag: "High-Tech"
                },
                { 
                  title: "Eco-Shield Canvas", 
                  description: "100% recycled industrial-strength canvas.",
                  image: "https://images.unsplash.com/photo-1582719188393-bb71ca45dbb9",
                  tag: "Sustainable"
                }
              ]
            }
          }
        ]
      }
    }
  ]
};

export const TEST_PROJECT_LC_CNC = {
  projectId: "lc-cnc-static-site",
  branding: {
    name: "LC-CNC",
    logo: "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=120&h=120&fit=crop",
    colors: {
      primary: "#0B3B66",
      accent: "#F59E0B",
    },
    style: {
      borderRadius: "md",
      typography: "Inter",
    },
  },
  pages: [
    {
      path: "/",
      seo: {
        title: "网站首页 | LC-CNC",
        description:
          "参考 szlczn.cn 首页信息：聚焦刀库机、精雕机与机械手方案，强调研发、生产、销售和交付服务一体化能力。",
      },
      puckData: {
        content: [
          {
            id: "home-hero-1",
            type: "Hero",
            props: {
              title: "LC-CNC 刀库机与精雕机整体解决方案",
              description:
                "基于数控设备主页面信息提炼：覆盖刀库机、玻璃精雕机、金属精雕机与机械手应用场景，服务制造企业从打样到量产。",
              ctaText: "查看产品展示",
              theme: "dark",
              effect: "retro-grid",
            },
          },
          {
            id: "home-stats-1",
            type: "Stats",
            props: {
              items: [
                { label: "核心产品线", value: "6", suffix: "+" },
                { label: "行业经验", value: "8", suffix: "年+" },
                { label: "服务热线", value: "0755", suffix: "-23426677" },
              ],
            },
          },
          {
            id: "home-cta-1",
            type: "CTASection",
            props: {
              title: "立即咨询 LC-CNC 解决方案",
              description: "获取设备选型建议、加工工艺支持与交付方案。",
              ctaText: "联系我们",
              ctaLink: "/contact/index.html",
              theme: "primary",
            },
          },
        ],
      },
    },
    {
      path: "/company",
      seo: {
        title: "公司概况 | LC-CNC",
        description:
          "参考公司概况主页面：展示企业简介、企业文化、地理位置与公司环境，突出制造型企业基础能力与服务保障。",
      },
      puckData: {
        content: [
          {
            id: "about-hero-1",
            type: "Hero",
            props: {
              title: "以研发与交付为核心的数控设备团队",
              subtitle: "围绕企业简介、企业文化与产线能力，构建稳定可靠的客户合作体系。",
              theme: "light",
              align: "text-center",
            },
          },
          {
            id: "about-values-1",
            type: "ValuePropositions",
            props: {
              title: "公司概况核心信息",
              items: [
                { title: "企业简介", description: "聚焦刀库机与精雕设备的研发与制造。", icon: "Building2" },
                { title: "企业文化", description: "坚持质量优先、客户导向、持续创新。", icon: "HeartHandshake" },
                { title: "地理位置与环境", description: "便于客户来访验厂与技术沟通。", icon: "MapPin" },
              ],
            },
          },
        ],
      },
    },
    {
      path: "/products",
      seo: {
        title: "产品展示 | LC-CNC",
        description:
          "参考产品展示主页面：覆盖刀库机、单头/双头/多头精雕机等产品方向，支持多材料加工与效率提升场景。",
      },
      puckData: {
        content: [
          {
            id: "capabilities-feature-1",
            type: "FeatureHighlight",
            props: {
              title: "产品矩阵：刀库机与多头精雕机",
              description:
                "围绕刀库机、单头/双头/三头/四头及多主轴设备，满足玻璃、金属等多类型加工需求。",
              image: "https://images.unsplash.com/photo-1581092160613-7f9f9f3f0f87?w=1200&h=800&fit=crop",
              align: "left",
              features: ["刀库机系列", "单头/双头/多头精雕机", "玻璃与金属加工适配"],
            },
          },
          {
            id: "capabilities-faq-1",
            type: "FAQ",
            props: {
              title: "产品常见问题",
              items: [
                { question: "支持哪些加工材料？", answer: "重点覆盖玻璃、金属等常见精雕加工材料。" },
                { question: "是否可按需选配自动化？", answer: "可结合机械手及产线要求进行方案配置。" },
              ],
            },
          },
        ],
      },
    },
    {
      path: "/news",
      seo: {
        title: "新闻中心 | LC-CNC",
        description: "参考新闻中心主页面：整合公司新闻、行业资讯与媒体资讯，便于客户追踪技术与企业动态。",
      },
      puckData: {
        content: [
          {
            id: "industries-preview-1",
            type: "ProductPreview",
            props: {
              title: "新闻栏目速览",
              items: [
                {
                  title: "公司新闻",
                  description: "发布公司动态、设备发布与参展信息。",
                  image: "https://images.unsplash.com/photo-1561144257-e32e8efc6c4f?w=900&h=600&fit=crop",
                  tag: "Company",
                },
                {
                  title: "行业资讯",
                  description: "跟踪数控设备与精雕加工行业趋势。",
                  image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=900&h=600&fit=crop",
                  tag: "Industry",
                },
                {
                  title: "媒体资讯",
                  description: "汇总媒体报道与公开传播内容。",
                  image: "https://images.unsplash.com/photo-1581092921461-39b9d08a9b9f?w=900&h=600&fit=crop",
                  tag: "Media",
                },
              ],
            },
          },
        ],
      },
    },
    {
      path: "/cases",
      seo: {
        title: "应用案例 | LC-CNC",
        description:
          "参考应用案例主页面：展示亚克力、玻璃、金属及其他案例，体现设备在多行业落地应用能力。",
      },
      puckData: {
        content: [
          {
            id: "quality-testimonials-1",
            type: "Testimonials",
            props: {
              title: "客户案例反馈",
              items: [
                {
                  content: "在玻璃加工场景中，设备稳定性和加工一致性明显提升。",
                  author: "项目负责人 A",
                  role: "玻璃案例",
                },
                {
                  content: "金属加工效率提升后，交付周期显著缩短。",
                  author: "项目负责人 B",
                  role: "金属案例",
                },
              ],
            },
          },
          {
            id: "quality-logos-1",
            type: "Logos",
            props: {
              title: "应用方向",
              items: [
                { name: "亚克力案例", logo: "https://logo.clearbit.com/acrylic.org" },
                { name: "玻璃案例", logo: "https://logo.clearbit.com/glass.org" },
                { name: "金属案例", logo: "https://logo.clearbit.com/metal.org" },
              ],
            },
          },
        ],
      },
    },
    {
      path: "/contact",
      seo: {
        title: "联系我们 | LC-CNC",
        description:
          "参考联系我们主页面：提供服务热线与咨询入口，支持客户就设备选型、报价与技术细节进行快速沟通。",
      },
      puckData: {
        content: [
          {
            id: "contact-feature-1",
            type: "FeatureHighlight",
            props: {
              title: "联系 LC-CNC 获取设备方案",
              description:
                "可围绕刀库机、精雕机与机械手相关需求进行咨询。基于源站公开信息，服务热线为 0755-23426677。",
              image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=800&fit=crop",
              align: "right",
              ctaText: "立即电话咨询",
              ctaLink: "tel:075523426677",
            },
          },
          {
            id: "contact-cta-1",
            type: "CTASection",
            props: {
              title: "提交需求，获取选型建议",
              description: "告诉我们材料、工艺与产能目标，我们将给出对应设备建议。",
              ctaText: "现在联系",
              ctaLink: "#",
              theme: "primary",
            },
          },
        ],
      },
    },
  ],
};
