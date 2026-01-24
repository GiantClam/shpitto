import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ProjectSchema } from "@industry/schema";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import crypto from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { updateTaskPlan, logLinterFinding, readFromMemory } from "./persistence";
import { saveProjectState, recordDeployment } from "./db";
import { COMPONENT_REGISTRY, REGISTRY_PROMPT_SNIPPET } from "./registry";
import { applyAtomicPatch, generateSkeletonProject, injectOrganizationJsonLd, normalizeComponentType, stitchTracks } from "./engine";
import { configureUndiciProxyFromEnv, createHttpsProxyAgentFromEnv, isRegionDeniedError } from "./network";
import { CloudflareClient } from "../cloudflare";
import { Bundler } from "../bundler";

// Load environment variables from .env file at project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple possible paths for .env
const envPaths = [
  path.resolve(__dirname, "../../../../.env"), // From lib/agent/graph.ts to root
  path.resolve(process.cwd(), "../../.env"),    // From apps/web to root
  path.resolve(process.cwd(), ".env"),          // From root to root
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

configureUndiciProxyFromEnv();

console.log("LLM Configuration:");
console.log("- Model:", process.env.LLM_MODEL);
console.log("- API Key Present:", !!process.env.OPENROUTER_API_KEY);
console.log("- Current Working Directory:", process.cwd());

// --- Helpers ---

/**
 * Generates a consistent, unique, and short message ID.
 * Uses a base-36 relative timestamp + counter + random suffix.
 */
let msgCounter = 0;
const EPOCH = 1735689600000; // 2025-01-01
const generateMsgId = () => {
    msgCounter++;
    const ts = (Date.now() - EPOCH).toString(36);
    const count = msgCounter.toString(36);
    const rand = crypto.randomBytes(2).toString('hex'); // 4 hex chars
    return `${ts}${count}${rand}`;
};

const parseLLMJson = (content: string) => {
  let json: any;
  try {
    // 1. 尝试直接解析
    json = JSON.parse(content.trim());
  } catch (e) {
    // 2. 尝试从 Markdown 代码块中提取
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        json = JSON.parse(match[1].trim());
      } catch (e2) {
        console.error("Failed to parse JSON from markdown block", e2);
      }
    }
    if (!json) {
        // 3. 尝试清理常见错误（如尾随逗号）
        const cleaned = content.trim()
          .replace(/,\s*([}\]])/g, '$1') // 移除对象或数组末尾的逗号
          .replace(/([{,])\s*([a-zA-Z0-9_]+):/g, '$1"$2":'); // 为 key 添加引号（如果缺失）
        try {
          json = JSON.parse(cleaned);
        } catch (e3) {
          throw new Error(`JSON Parse Error: ${e3 instanceof Error ? e3.message : String(e3)}`);
        }
    }
  }

  // --- 智能后处理适配器 (Auto-Repair) ---
  
  // A. 修复 site_config 包装问题
  if (json.site_config) {
    const siteConfig = json.site_config;
    if (siteConfig.branding) json.branding = { ...json.branding, ...siteConfig.branding };
    if (siteConfig.projectId) json.projectId = siteConfig.projectId;
    // 不要删除 site_config，保持原样但提取内容，以防后续逻辑依赖
  }

  // B. 修复颜色字段名 (secondary -> accent)
  if (json.branding?.colors) {
      if (json.branding.colors.secondary && !json.branding.colors.accent) {
          json.branding.colors.accent = json.branding.colors.secondary;
      }
  }

  // C. 修复页面 structure (展平 title/content 到 puckData)
  if (Array.isArray(json.pages)) {
      json.pages = json.pages.map((page: any) => {
          // 如果 title/description 在顶层而不在 seo 里
          if (page.title && !page.seo?.title) {
              page.seo = { ...page.seo, title: page.title };
          }
          if (page.description && !page.seo?.description) {
              page.seo = { ...page.seo, description: page.description };
          }
          // 如果 content 在顶层而不在 puckData 里
          if (page.content && !page.puckData?.content) {
              page.puckData = { ...page.puckData, content: page.content };
          }
          return page;
      });
  }

  // D. 修复组件名称 (智能模糊匹配 + ID 生成)
    if (Array.isArray(json.pages)) {
        json.pages.forEach((page: any) => {
            if (page.puckData?.content) {
                page.puckData.content = page.puckData.content.map((comp: any) => {
                    // Auto-fix component name using fuzzy map
                    if (comp.type) {
                        comp.type = normalizeComponentType(comp.type);
                    }

                    // E. 确保每个组件都有唯一的 ID (Puck 渲染需要 ID 作为 Key)
                    // 修正：如果组件已经有 id (来自 LLM)，则保留；如果没有才生成。
                    // 同时确保 id 不在 props 里面，而是在顶层。
                    if (!comp.id) {
                        comp.id = comp.props?.id || generateMsgId();
                    }
                    
                    if (!comp.props) comp.props = {};
                    
                    // 递归处理数组类型的字段，确保它们里面的项也有 key
                    Object.keys(comp.props).forEach(key => {
                        if (Array.isArray(comp.props[key])) {
                            comp.props[key] = comp.props[key].map((item: any, idx: number) => {
                                if (typeof item === 'object' && item !== null && !item.id) {
                                    item.id = `item-${idx}-${generateMsgId()}`;
                                }
                                return item;
                            });
                        }
                    });
                    
                    return comp;
                });
            }
        });
    }

    return json;
};

// --- State Definition ---

export interface AgentState {
  messages: BaseMessage[];
  phase: string; 
  project_outline?: string;
  project_json?: any;   // Final Puck JSON (ProjectSchema)
  track_results?: any[];
  patch_request?: string;
  sitemap?: any;
  industry?: string;
  theme?: { primaryColor: string; mode: "dark" | "light" } | undefined;
  history?: string[];
  pages_to_expand?: string[]; // 待生成的页面路径队列
  current_page_index: number; // 当前正在处理第几个页面
  seo_keywords?: string[]; // 全站关键词策略
  critique_feedback?: string;
  validation_error?: string;
  attempt_count: number;
  deployed_url?: string;
  user_id?: string;      // User ID from Supabase
  access_token?: string; // Access Token for Supabase
  db_project_id?: string; // Supabase Project ID
}

// --- Model Factory ---

const getModel = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelName = process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }

  // 关键：强制让 LangChain 认为这是一个 OpenAI 接口，以避免 Provider 校验失败
  const httpAgent = createHttpsProxyAgentFromEnv();
  return new ChatOpenAI({
    modelName: modelName,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://shpitto.com",
        "X-Title": "Shpitto",
      },
      ...(httpAgent ? { httpAgent } : {}),
    },
    temperature: 0,
  });
};

const getModelWithName = (modelName: string, temperature = 0) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing");
  const httpAgent = createHttpsProxyAgentFromEnv();
  return new ChatOpenAI({
    modelName,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://shpitto.com",
        "X-Title": "Shpitto",
      },
      ...(httpAgent ? { httpAgent } : {}),
    },
    temperature,
  });
};

const getFallbackModelName = () => process.env.LLM_MODEL_FALLBACK || "anthropic/claude-sonnet-4.5";

// --- Constants ---

const jsonSchema = zodToJsonSchema(ProjectSchema as any, "project");
const SCHEMA_STRING = JSON.stringify(jsonSchema, null, 2);

const ConversationIntentSchema = z.object({
  intent: z.enum(["chat", "propose_plan", "confirm_build", "deploy"]).describe("The intent of your response."),
  message: z.string().describe("The conversational response to the user."),
  plan_outline: z.string().optional().describe("The full website plan outline. Required if intent is 'propose_plan'.").nullable()
});

// 1. Conversation Node: Gathers requirements and proposes Outline
const conversationNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log(`--- Conversation Node Started (Phase: ${state.phase}) ---`);
  const lastHuman = [...state.messages].reverse().find((m) => m instanceof HumanMessage) as HumanMessage | undefined;
  const lastHumanText = lastHuman?.content?.toString?.() || "";
  const lastHumanLower = lastHumanText.toLowerCase();

  if (state.phase === "end" && state.project_json && lastHumanText) {
    const isDeployRequest =
      lastHumanLower.includes("deploy") ||
      lastHumanLower.includes("publish") ||
      lastHumanLower.includes("发布") ||
      lastHumanLower.includes("部署");

    if (!isDeployRequest) {
      return {
        messages: [
          new AIMessage({
            id: generateMsgId(),
            content: "收到，我会基于当前站点进行增量修改并保持其他部分不变。",
          }),
        ],
        phase: "patch",
        patch_request: lastHumanText,
      };
    }
  }
  const model = getModel();
  
  // 使用结构化输出以确保意图识别的准确性
  const structuredModel = model.withStructuredOutput(ConversationIntentSchema as any);
  
  const systemPrompt = `You are an expert Product Manager for Industrial SaaS.
  Your goal is to gather requirements from the user to build or modify a website.
  
  CURRENT PHASE: ${state.phase}
  
  LOGIC RULES:
  1. **CHAT**: Use this to ask clarifying questions. 
     - **Guidance**: You MUST guide the user. Do not just wait for input.
     - **Required Info**: If you don't know the *Industry*, *Target Audience*, or *Visual Style*, ASK for it before proposing a plan.
     - **Modifications**: If the user wants to change details (color, text, layout) at ANY stage (even after build), discuss the change and then use 'PROPOSE_PLAN' to update the blueprint.
  
  2. **PROPOSE_PLAN**: Use this when you have enough information to create or update the website plan. 
     - You MUST provide the full 'plan_outline'.
     - If modifying, reflect the changes in the outline.
  
  3. **CONFIRM_BUILD**: Use this ONLY when the user explicitly approves the plan (e.g., "build it", "looks good", "yes").
  
  4. **DEPLOY**: Use this ONLY when the user explicitly requests deployment (e.g., "deploy", "publish").
  
  CRITICAL: 
  - If the user says "change the color to blue", intent is PROPOSE_PLAN (with updated outline mentioning blue theme).
  - If the user says "remove the hero section", intent is PROPOSE_PLAN (with updated outline).
  - Do NOT auto-deploy.
  
  EXISTING OUTLINE (if any):
  ${state.project_outline || "None"}
  
  USER FEEDBACK:
  If the user asks for changes to the plan, stay in 'propose_plan' and update the outline.
  If the user gives a thumbs up, move to 'confirm_build'.

  **IMAGE ASSETS GATHERING (IMPORTANT):**
  - **Proactively ask the user for images**: Before finalizing the plan, ask the user if they have specific images for:
    - Company Logo
    - Product Photos
    - Team/People Photos
    - Background/Hero Images
  - **Explain the benefit**: Tell them that providing real images now will make the initial preview much more realistic and save them time later.
  - **Instruction**: "You can upload images directly in the chat, or provide URL links. Please specify what each image is for (e.g., 'This is our logo', 'Use this for the Hero section')."
  - **Tracking**: If the user provides images, acknowledge them and mention that they will be incorporated into the design.
  
  PLAN HISTORY:
  ${state.project_outline ? `Current Plan Outline: \n${state.project_outline}` : "No plan proposed yet."}
  `;

  // Filter history to remove tool_calls from previous messages.
  // This is required because Gemini/OpenRouter are strict about tool-call-response pairs.
  // Frontend-only tool calls (like presentActions) don't have responses, so we strip them
  // from the history sent to the LLM to avoid 400 errors.
  const cleanHistory = state.messages.map(msg => {
    // 1. Handle AIMessages: remove tool_calls and associated kwargs
    if (msg instanceof AIMessage) {
      const hasToolCalls = (msg.tool_calls && msg.tool_calls.length > 0) || 
                          (msg.additional_kwargs && msg.additional_kwargs.tool_calls);
      
      if (hasToolCalls) {
        const cleanKwargs = { ...msg.additional_kwargs };
        delete cleanKwargs.tool_calls;
        delete cleanKwargs.actions;

        return new AIMessage({
          content: msg.content,
          additional_kwargs: cleanKwargs,
          id: msg.id
        });
      }
    }
    // 2. Remove any ToolMessages or FunctionMessages entirely
    // Gemini doesn't want to see tool responses if we've removed the calls
    const type = (msg as any)._getType?.() || (msg as any).type;
    if (type === "tool" || type === "function") {
      return null;
    }
    return msg;
  }).filter(msg => msg !== null) as BaseMessage[];

  // Debug: Log message types and tool call presence
  console.log("--- Cleaned History for LLM ---");
  cleanHistory.forEach((m, i) => {
    const type = (m as any)._getType?.() || (m as any).type;
    const toolCount = (m as any).tool_calls?.length || 0;
    const kwargToolCount = (m as any).additional_kwargs?.tool_calls?.length || 0;
    console.log(`[${i}] ${type}: content_len=${m.content.toString().length}, tool_calls=${toolCount}, kwarg_tools=${kwargToolCount}`);
  });

  const messages = [
      new SystemMessage(systemPrompt), 
      ...cleanHistory 
  ];

  console.log("Conversation Node: Invoking Structured LLM...");
  try {
    const result = await structuredModel.invoke(messages);
    
    const intent = result.intent;
    const displayMessage = result.message;
    const outline = result.plan_outline || state.project_outline;

    console.log("Conversation Node: Detected Intent:", intent);

    let nextPhase = state.phase;
    let finalMessage = displayMessage;

    if (intent === "confirm_build") {
        nextPhase = "skeleton";
        console.log("🚀 [System] User approved plan. Transitioning to Skeleton phase...");
    } else if (intent === "deploy" && state.phase === "end" && !state.deployed_url) {
        nextPhase = "deploy";
        console.log("🚢 [System] User requested deployment. Transitioning to Deploy phase...");
    } else if (intent === "deploy" && state.phase === "end" && state.deployed_url) {
        // Already deployed, just show the link
        nextPhase = "conversation"; 
        finalMessage = "✅ 网站已经部署成功！您可以通过上面的链接访问。";
        console.log("🚢 [System] User requested deployment but site is already live.");
    } else if (intent === "propose_plan") {
        nextPhase = "conversation"; 
        console.log("📋 [Planner] Plan Proposed/Updated.");
        // Ensure the outline is visible in the chat if it's not already in the message
        if (outline && !finalMessage.includes(outline)) {
            finalMessage += `\n\n${outline}`;
        }
        finalMessage += "\n\n如果您对当前的规划满意，请告知我开始生成预览。";
    } else {
        nextPhase = "conversation";
    }

    let actions: any[] | undefined = undefined;

    if (state.phase === "end" && !state.deployed_url) {
         actions = [
             {
                 text: "Deploy to Cloudflare",
                 payload: "deploy",
                 type: "button"
             }
         ];
     } else if (state.deployed_url) {
         actions = [
             {
                 text: "View Live Site",
                 payload: state.deployed_url,
                 type: "url"
             }
         ];
     }

    console.log(`Conversation Node: phase=${state.phase}, intent=${intent}, actions to present:`, actions);

    return {
      messages: [
        new AIMessage({
          id: generateMsgId(),
          content: finalMessage,
          additional_kwargs: {
            outline: intent === "propose_plan" ? outline : undefined,
            actions
          },
          tool_calls: actions ? [{
            id: `call_${generateMsgId()}`,
            name: "presentActions",
            args: { actions }
          }] : undefined
        }),
      ],
      phase: nextPhase,
      project_outline: outline
    };
  } catch (error) {
    if (isRegionDeniedError(error)) {
      const fallbackModelName = getFallbackModelName();
      try {
        const fallbackModel = getModelWithName(fallbackModelName, 0);
        const fallbackStructured = fallbackModel.withStructuredOutput(ConversationIntentSchema as any);
        const result = await fallbackStructured.invoke(messages);

        const intent = result.intent;
        const displayMessage = result.message;
        const outline = result.plan_outline || state.project_outline;

        let nextPhase = state.phase;
        let finalMessage = displayMessage;

        if (intent === "confirm_build") {
          nextPhase = "skeleton";
        } else if (intent === "deploy" && state.phase === "end" && !state.deployed_url) {
          nextPhase = "deploy";
        } else if (intent === "deploy" && state.phase === "end" && state.deployed_url) {
          nextPhase = "conversation";
          finalMessage = "✅ 网站已经部署成功！您可以通过上面的链接访问。";
        } else if (intent === "propose_plan") {
          nextPhase = "conversation";
          if (outline && !finalMessage.includes(outline)) {
            finalMessage += `\n\n${outline}`;
          }
          finalMessage += "\n\n如果您对当前的规划满意，请告知我开始生成预览。";
        } else {
          nextPhase = "conversation";
        }

        let actions: any[] | undefined = undefined;
        if (state.phase === "end" && !state.deployed_url) {
          actions = [{ text: "Deploy to Cloudflare", payload: "deploy", type: "button" }];
        } else if (state.deployed_url) {
          actions = [{ text: "View Live Site", payload: state.deployed_url, type: "url" }];
        }

        return {
          messages: [
            new AIMessage({
              id: generateMsgId(),
              content: finalMessage,
              additional_kwargs: {
                outline: intent === "propose_plan" ? outline : undefined,
                actions,
              },
              tool_calls: actions
                ? [
                    {
                      id: `call_${generateMsgId()}`,
                      name: "presentActions",
                      args: { actions },
                    },
                  ]
                : undefined,
            }),
          ],
          phase: nextPhase,
          project_outline: outline,
        };
      } catch (fallbackErr) {
        console.error("❌ Conversation Node Fallback Error:", fallbackErr);
      }
    }

    console.error("❌ Conversation Node Error:", error);
    return {
      messages: [
        new AIMessage({
          id: generateMsgId(),
          content: "我这边调用模型时遇到错误（可能是区域限制）。你可以在 .env 里设置 LLM_MODEL_FALLBACK 或配置代理后重试。",
        }),
      ],
      phase: "conversation",
    };
  }
};

// 2. Skeleton Node: Generates Site Structure & Page List (SEO Optimized)
const skeletonNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Skeleton Node Started ---");
  const model = getModel();
  
  // Manus-style Persistence: Read past findings & golden examples
  const pastFindings = await readFromMemory('findings.md');
  const goldenExamples = await readFromMemory('golden_examples.md');
  
  const systemPrompt = `你现在正在执行 SKELETON (架构设计) 阶段。
  你的任务是根据网站大纲，生成网站的全局配置和页面列表框架。
  
  ${goldenExamples ? `
  ### 💎 完美示例 (Golden Examples):
  参考以下结构生成 JSON：
  ${goldenExamples}
  ` : ""}
  
  ### 核心任务：
  1. **审美与风格推断**：深度解析用户对话历史，推断其审美偏好（如：极简、硬核工业、未来感、温暖人性化等）。
  2. **视觉策略定义**：根据推断出的审美，定义全站的视觉基调（色彩倾向、间距感、组件主题选择偏好）。
  3. **页面架构设计**：根据网站大纲，设计每个页面的核心目标。不要套用固定模板，而是根据该页面的“叙事目标”规划其结构。
  
  ### SEO 核心要求：
  1. **关键词规划**：分析大纲，提取 3-5 个核心行业关键词。
  2. **URL 优化**：页面 path 必须语义化。
  3. **菜单精简**：页面 SEO Title 可以很长，但 SEO Description 用于 Meta 描述。**重要：** 页面的导航菜单名称 (Nav Label) 将直接从 SEO Title 截取，因此请确保 SEO Title 的前 2-3 个单词能准确、简短地概括页面内容（例如 "About Us", "Services", "Pricing"），避免冗长换行。
  
  ### 核心任务 (必须严格遵守此 JSON 结构)：
  你必须生成一个符合 ProjectSchema 的 JSON。
  
  【JSON 结构参考】：
  {
    "projectId": "unique-id",
    "branding": {
      "name": "品牌名称",
      "logo": "https://...",
      "colors": { "primary": "#...", "accent": "#..." },
      "style": { "borderRadius": "sm/none/md/lg", "typography": "字体名称" }
    },
    "pages": [
      {
        "path": "/",
        "seo": { "title": "...", "description": "..." },
        "puckData": { "content": [] } // 初始为空，由后续节点填充
      }
    ]
  }

  ### 字段约束 (Schema 详情)：
  ${SCHEMA_STRING}

  ### 约束：
  - **禁止套路**：严禁所有页面使用相同的 Hero -> Feature -> CTA 结构。
  - **多样性强制**：每个页面的 layout_intent 必须不同。例如：
    - 首页 (LANDING)：高冲击力，重转化。
    - 产品页 (PRODUCT_LIST)：重展示，网格布局。
    - 关于页 (ABOUT)：重叙事，文本为主。
    - 联系页 (CONTACT)：重功能，表单与地图。
  - **反馈优先**：如果用户在对话中提到过任何关于颜色、风格或特定布局的要求，必须在此阶段体现到 branding 和页面规划中。
  
  ${state.validation_error ? `
  ### ⚠️ 修复建议 (重要):
  上次生成失败，校验错误如下：
  ${state.validation_error}
  请务必修复上述错误。
  ` : ""}

  ${pastFindings ? `
  ### 📚 历史教训 (来自之前的尝试):
  以下是之前尝试中积累的经验，请务必参考以避免重复错误：
  ${pastFindings}
  ` : ""}

  APPROVED OUTLINE:
  ${state.project_outline}
  `;

  const response = await model.invoke([new SystemMessage(systemPrompt)]);
  let skeleton = null;
  try {
    skeleton = parseLLMJson(response.content.toString());
  } catch (e) {
    console.error("Skeleton JSON Parse Error", e);
    return {
      validation_error: `Skeleton parsing failed: ${e instanceof Error ? e.message : String(e)}`,
      phase: "conversation"
    };
  }

  const pagesToExpand = skeleton?.pages?.map((p: any) => p.path) || [];
  const safePaths = pagesToExpand.length ? pagesToExpand : ["/"];
  const primary = skeleton?.branding?.colors?.primary || "#0052FF";
  const accent = skeleton?.branding?.colors?.accent || "#22C55E";
  const brandingName = skeleton?.branding?.name || "Shpitto";
  const skeletonWithIds = generateSkeletonProject({
    brandingName,
    primary,
    accent,
    paths: safePaths,
  });
  const contentByPath = new Map<string, any[]>(
    (skeletonWithIds.pages || []).map((p: any) => [p.path, p.puckData?.content || []])
  );

  skeleton.pages = (skeleton.pages || []).map((p: any) => ({
    ...p,
    puckData: {
      ...(p.puckData || {}),
      root: p.puckData?.root || { props: {} },
      content: contentByPath.get(p.path) || p.puckData?.content || [],
    },
  }));
  
  // Manus-style Persistence: Store the plan on disk
  await updateTaskPlan(`
## Site Architecture
- Project ID: ${skeleton.projectId}
- Pages to generate: ${pagesToExpand.join(', ')}

## Branding Decisions
- Primary Color: ${skeleton.branding?.colors?.primary}
- Accent Color: ${skeleton.branding?.colors?.accent}
- Border Radius: ${skeleton.branding?.style?.borderRadius}
  `);

  return {
    messages: [new AIMessage({ id: generateMsgId(), content: "🏗️ 正在设计 SEO 优化的网站架构..." })],
    project_json: skeleton,
    pages_to_expand: [],
    current_page_index: 0,
    sitemap: pagesToExpand,
    history: [],
    phase: "parallel"
  };
};

const parallelNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Parallel Node Started (3-track stitching) ---");
  const skeleton = state.project_json;
  if (!skeleton) {
    return { phase: "conversation" };
  }

  const architectModelName = process.env.LLM_MODEL_ARCHITECT || process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";
  const copyModelName = process.env.LLM_MODEL_COPYWRITER || process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";
  const styleModelName = process.env.LLM_MODEL_STYLIST || process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";

  const architectModel = getModelWithName(architectModelName, 0);
  const copyModel = getModelWithName(copyModelName, 0.2);
  const styleModel = getModelWithName(styleModelName, 0.2);

  const skeletonJson = JSON.stringify(skeleton, null, 2);

  const architectPrompt = `你是 Track A: Architect。你的任务是在不改变页面 path 与组件 id 的前提下，生成 100% 合法的 ProjectSchema JSON。

约束：
- 必须保留并复用输入 skeleton 里的 projectId、branding、pages/path、以及每个组件的 id。
- 不要新增或删除组件；保持 skeleton 中组件的数量、顺序和 type 不变。
- 组件 type 必须严格使用以下集合：Hero, Stats, Testimonials, ValuePropositions, ProductPreview, FeatureHighlight, CTASection, FAQ, Logos
- props 字段必须符合 schema，字段名使用 camelCase（例如 ctaText/ctaLink，不要用 cta_text/cta_link）。
- 返回完整 JSON，不要 Markdown。

ProjectSchema:
${SCHEMA_STRING}

输入 Skeleton JSON:
${skeletonJson}`;

  const copyPrompt = `你是 Track B: Copywriter。你只输出按组件 id 寻址的文案补丁，不要输出完整页面结构。

输出 JSON 格式：
{
  "payload": {
    "hero_01": { "title": "...", "subtitle": "...", "description": "...", "ctaText": "..." },
    "value_propositions_01": { "title": "...", "items": [ ... ] }
  }
}

约束：
- 只能输出与文案相关的字段（title/subtitle/description/items[*].title/items[*].description/question/answer 等）。
- 不要输出颜色、theme、effect、align、image、logo。
- 返回 JSON，不要 Markdown。

输入 Skeleton JSON:
${skeletonJson}`;

  const stylePrompt = `你是 Track C: Stylist。你只输出按组件 id 寻址的视觉与动效补丁，不要输出完整页面结构。

输出 JSON 格式：
{
  "payload": {
    "hero_01": { "theme": "dark", "effect": "retro-grid", "align": "text-center", "image": "https://..." },
    "feature_highlight_01": { "align": "right", "image": "https://..." }
  }
}

约束：
- 只能输出与视觉相关字段（theme/effect/align/image/icon/logo 等）。
- 文案字段留给 Copywriter，不要写长段落。
- 返回 JSON，不要 Markdown。

输入 Skeleton JSON:
${skeletonJson}`;

  const [architectRaw, copyRaw, styleRaw] = await Promise.all([
    architectModel.invoke([new SystemMessage(architectPrompt)]),
    copyModel.invoke([new SystemMessage(copyPrompt)]),
    styleModel.invoke([new SystemMessage(stylePrompt)]),
  ]);

  let architectJson: any = skeleton;
  let copyJson: any = { payload: {} };
  let styleJson: any = { payload: {} };

  try {
    architectJson = parseLLMJson(architectRaw.content.toString());
  } catch (e) {
    console.error("Architect JSON Parse Error", e);
  }

  try {
    copyJson = parseLLMJson(copyRaw.content.toString());
  } catch (e) {
    console.error("Copywriter JSON Parse Error", e);
  }

  try {
    styleJson = parseLLMJson(styleRaw.content.toString());
  } catch (e) {
    console.error("Stylist JSON Parse Error", e);
  }

  return {
    messages: [new AIMessage({ id: generateMsgId(), content: "🧵 正在进行三路协作生成与缝合..." })],
    project_json: architectJson,
    track_results: [copyJson, styleJson],
    phase: "stitcher",
  };
};

const stitcherNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Stitcher Node Started ---");
  if (!state.project_json) return { phase: "conversation" };
  const merged = stitchTracks(state.project_json, state.track_results || []);
  return {
    messages: [new AIMessage({ id: generateMsgId(), content: "🧩 已完成属性缝合，正在进行语义对齐与硬修复..." })],
    project_json: merged,
    phase: "liner",
  };
};

const linerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Liner Node Started ---");
  if (!state.project_json) return { phase: "conversation" };

  const project = structuredClone(state.project_json);

  if (!project.branding?.style?.typography) {
    project.branding = {
      ...project.branding,
      style: { ...(project.branding?.style || {}), typography: "Inter", borderRadius: project.branding?.style?.borderRadius || "sm" },
    };
  }

  if (!project.branding?.colors?.primary || !/^#[0-9A-F]{6}$/i.test(project.branding.colors.primary)) {
    project.branding = { ...project.branding, colors: { ...(project.branding?.colors || {}), primary: "#0052FF" } };
  }
  if (!project.branding?.colors?.accent || !/^#[0-9A-F]{6}$/i.test(project.branding.colors.accent)) {
    project.branding = { ...project.branding, colors: { ...(project.branding?.colors || {}), accent: "#22C55E" } };
  }

  for (const page of project.pages || []) {
    page.seo = page.seo || { title: `${project.branding?.name || "Website"} | ${page.path}`, description: "A professional website." };
    page.puckData = page.puckData || { root: { props: {} }, content: [] };
    page.puckData.root = page.puckData.root || { props: {} };
    page.puckData.root.props = page.puckData.root.props || {};
    const content = Array.isArray(page.puckData.content) ? page.puckData.content : [];

    page.puckData.content = content.map((comp: any) => {
      const next = { ...comp };
      next.type = normalizeComponentType(next.type);
      next.id = next.id || next.props?.id || generateMsgId();
      next.props = next.props || {};

      if (next.props.cta_text && !next.props.ctaText) next.props.ctaText = next.props.cta_text;
      if (next.props.cta_link && !next.props.ctaLink) next.props.ctaLink = next.props.cta_link;

      if (next.type === "Hero" && !next.props.title) next.props.title = "Welcome";
      if (next.type === "Stats" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ label: "Metric", value: "0", suffix: "" }];
      }
      if (next.type === "Testimonials" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ content: "Great results.", author: "Customer", role: "" }];
      }
      if (next.type === "ValuePropositions" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ title: "Benefit", description: "Description", icon: "Check" }];
      }
      if (next.type === "ProductPreview" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ title: "Item", description: "Description", image: "", tag: "" }];
      }
      if (next.type === "FAQ" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ question: "Question", answer: "Answer" }];
      }

      return next;
    });
  }

  const validation = ProjectSchema.safeParse(project);
  const validationError = validation.success ? undefined : validation.error.message;

  return {
    project_json: project,
    validation_error: validationError,
    phase: "seo_optimization",
  };
};

const patchNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Patch Node Started ---");
  if (!state.project_json || !state.patch_request) {
    return { phase: "end" };
  }

  const model = getModel();
  const systemPrompt = `你是 Patch Node。你的任务是把用户的修改指令转成“原子化寻址更新”。

输入：
- 当前 Project JSON（保持不变的部分不要动）
- 用户指令

输出 JSON 格式：
{
  "patches": [
    { "id": "hero_01", "path": "props.title", "value": "..." }
  ]
}

约束：
- 只能修改已存在的组件 id。
- path 使用点路径，默认从组件对象开始（例如 props.title / props.items.0.title）。
- 返回 JSON，不要 Markdown。

当前 Project JSON:
${JSON.stringify(state.project_json)}

用户指令:
${state.patch_request}`;

  const resp = await model.invoke([new SystemMessage(systemPrompt)]);
  let patches: any[] = [];
  try {
    const parsed = parseLLMJson(resp.content.toString());
    patches = Array.isArray(parsed.patches) ? parsed.patches : [];
  } catch (e) {
    console.error("Patch JSON Parse Error", e);
  }

  let nextProject = state.project_json;
  for (const p of patches) {
    if (p?.id && typeof p?.path === "string") {
      nextProject = applyAtomicPatch(nextProject, p);
    }
  }

  return {
    messages: [new AIMessage({ id: generateMsgId(), content: "✅ 已应用增量修改，正在重新校验并更新预览..." })],
    project_json: nextProject,
    patch_request: undefined,
    history: [...(state.history || []), state.patch_request],
    phase: "liner",
  };
};

// 3. Page Expansion Node: Generates content for a single page (SEO Content Focus)
const pageExpansionNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  const currentIndex = state.current_page_index;
  const path = state.pages_to_expand![currentIndex];
  console.log(`--- Page Expansion Node: ${path} (${currentIndex + 1}/${state.pages_to_expand!.length}) ---`);
  
  const model = getModel();
  const currentPage = state.project_json.pages.find((p: any) => p.path === path);
  const brandingStr = JSON.stringify(state.project_json.branding);
  const goldenExamples = await readFromMemory('golden_examples.md');

  // Determine Layout Strategy based on path or intent
  const layoutIntent = currentPage.layout_intent || 
    (path === "/" ? "LANDING" : 
     path.includes("about") ? "ABOUT" : 
     path.includes("contact") ? "CONTACT" : 
     path.includes("pricing") ? "PRICING" :
     path.includes("team") ? "TEAM" :
     path.includes("blog") || path.includes("news") ? "BLOG" :
     path.includes("career") || path.includes("job") ? "CAREERS" :
     path.includes("service") || path.includes("product") ? "PRODUCT_LIST" : "GENERAL");

  let layoutStrategyPrompt = "";
  let relevantExampleKey = "";

  switch (layoutIntent) {
    case "LANDING":
      layoutStrategyPrompt = `
      **STRATEGY: CONVERSION & AUTHORITY**
      - Structure: High-impact Hero -> Social Proof (Logos/Stats) -> Value Props -> Feature Highlights (FeatureHighlight) -> Product Preview -> Testimonials -> CTA (CTASection).
      - Goal: Convince the user to take action immediately.
      - Components: Use 'Hero', 'Logos', 'Stats', 'ValuePropositions', 'FeatureHighlight', 'ProductPreview', 'Testimonials', 'CTASection'.
      `;
      relevantExampleKey = "Type A: Landing Page";
      break;
    case "ABOUT":
      layoutStrategyPrompt = `
      **STRATEGY: NARRATIVE & TRUST**
      - Structure: Mission Statement (ValuePropositions) -> History/Values (FeatureHighlight) -> Team (ProductPreview) -> Testimonials -> CTA.
      - Goal: Build emotional connection and trust.
      - Components: Use 'ValuePropositions', 'FeatureHighlight', 'ProductPreview' (for Team), 'Testimonials', 'CTASection'.
      `;
      relevantExampleKey = "Type B: About Us Page";
      break;
    case "PRODUCT_LIST":
    case "SERVICES":
      layoutStrategyPrompt = `
      **STRATEGY: CLARITY & COMPARISON**
      - Structure: Descriptive Hero -> Product Grid (ProductPreview) -> Detailed Features (FeatureHighlight) -> FAQ -> CTA.
      - Goal: Help user find the right solution and answer objections.
      - Components: Use 'Hero', 'ProductPreview', 'FeatureHighlight', 'FAQ', 'CTASection'.
      `;
      relevantExampleKey = "Type C: Services/Product Page";
      break;
    case "PRICING":
      layoutStrategyPrompt = `
      **STRATEGY: TRANSPARENCY & VALUE**
      - Structure: Clear Header (Hero) -> Pricing Cards (ProductPreview) -> Comparison (ValuePropositions) -> FAQ -> CTA.
      - Goal: Clear value proposition and easy decision making.
      - Components: Use 'Hero', 'ProductPreview' (repurposed for pricing tiers), 'ValuePropositions', 'FAQ', 'CTASection'.
      `;
      break;
    case "TEAM":
      layoutStrategyPrompt = `
      **STRATEGY: HUMAN CONNECTION**
      - Structure: Leadership Grid (ProductPreview) -> Culture/Values (FeatureHighlight) -> Careers CTA.
      - Goal: Showcase the people behind the brand.
      - Components: Use 'ProductPreview' (for team members), 'FeatureHighlight', 'CTASection'.
      `;
      break;
    case "BLOG":
      layoutStrategyPrompt = `
      **STRATEGY: THOUGHT LEADERSHIP**
      - Structure: Featured Articles (ProductPreview) -> Newsletter CTA.
      - Goal: Share knowledge and engage users.
      - Components: Use 'ProductPreview' (for articles), 'CTASection'.
      `;
      break;
    case "CAREERS":
      layoutStrategyPrompt = `
      **STRATEGY: ATTRACT TALENT**
      - Structure: Benefits (ValuePropositions) -> Open Roles (ProductPreview) -> CTA.
      - Goal: Attract top talent.
      - Components: Use 'ValuePropositions', 'ProductPreview', 'CTASection'.
      `;
      break;
    case "CONTACT":
      layoutStrategyPrompt = `
      **STRATEGY: DIRECT RESPONSE**
      - Structure: Contact Info (FeatureHighlight) -> FAQs (FAQ) -> CTA.
      - Goal: Make it easy to get in touch quickly.
      - Components: Use 'FeatureHighlight', 'FAQ', 'CTASection'.
      `;
      break;
    default:
    case "GENERAL":
      layoutStrategyPrompt = `
      **STRATEGY: INFORMATIONAL**
      - Structure: Content Body (FeatureHighlight/ValuePropositions) -> CTA.
      - Goal: Provide information clearly.
      - Components: Use 'FeatureHighlight', 'ValuePropositions', 'CTASection'.
      `;
      break;
  }

  // Smart Context Selection: Only include the relevant example from Golden Examples
  let filteredExamples = "";
  if (goldenExamples) {
      if (relevantExampleKey) {
          const exampleMatch = goldenExamples.split(`### ${relevantExampleKey}`)[1]?.split("### Type")[0];
          if (exampleMatch) {
              filteredExamples = `### ${relevantExampleKey}\n${exampleMatch.trim()}`;
          }
      } 
      
      // Fallback: If no specific match or intent, use a truncated version of the whole file, but longer than before
      if (!filteredExamples) {
          filteredExamples = goldenExamples.length > 3000 ? goldenExamples.substring(0, 3000) + "\n...(truncated)" : goldenExamples;
      }
  }

  const systemPrompt = `你现在正在执行 PAGE_CONTENT (视觉与内容设计) 阶段。
  你要为路径为 "${path}" 的页面设计极具视觉冲击力的内容。
  
  ### 核心布局策略 (${layoutIntent}):
  ${layoutStrategyPrompt}

  ${filteredExamples ? `
  ### 💎 参考示例 (仅供结构参考):
  ${filteredExamples}
  ` : ""}

  ### 创意设计指南：
  1. **叙事驱动布局**：不要套用固定公式。根据上述 STRATEGY 自由组合组件。
  2. **审美连贯性**：确保组件的 theme 和 align 选择符合全站定义的视觉基调 (${brandingStr})。
  3. **交互与节奏**：通过不同组件的交替使用创造视觉节奏，但顺序应根据内容逻辑自然流动。
  4. **图片策略 (Crucial)**：
     - 必须为所有需要图片的组件（Hero, Product_Preview, Feature_Highlight, Logos, Testimonials）生成图片 URL。
     - **优先使用用户提供的图片**：如果在对话历史中用户提供了图片 URL，请务必在合适的位置使用它们。
     - **占位图回退**：如果用户未提供，请使用高质量的 Unsplash URL。不要使用失效的链接。
     - URL 格式示例：\`https://images.unsplash.com/photo-ID?w=800&h=600&fit=crop\`
  
  ${REGISTRY_PROMPT_SNIPPET}
  
  ### 要求：
  1. 深度分析用户的具体反馈（如果有）来决定组件的细节。
  2. 仅返回 content 数组 JSON，不要有任何 Markdown 包裹。
  3. 确保每个组件的 props 内容丰富、专业且具有说服力。
  4. **多样性强制**：不要只是复制 Landing Page 的结构。根据页面类型使用 FAQ, Content_Block, CTA_Section 等组件。
  
  APPROVED OUTLINE:
  ${state.project_outline}
  `;

  const response = await model.invoke([new SystemMessage(systemPrompt)]);
  let pageContent = [];
  let errorMsg = null;
  try {
    pageContent = parseLLMJson(response.content.toString());
  } catch (e) {
    console.error(`Page Content Parse Error (${path})`, e);
    errorMsg = `Failed to generate content for ${path}: ${e instanceof Error ? e.message : String(e)}`;
    pageContent = [{
      type: "Hero",
      props: {
        title: "页面内容生成出错",
        subtitle: `路径: ${path}. 错误: ${errorMsg}`
      }
    }];
  }

  // 更新 project_json 中的对应页面内容 (puckData.content)
  const newProjectJson = { ...state.project_json };
  const pageIdx = newProjectJson.pages.findIndex((p: any) => p.path === path);
  if (pageIdx !== -1) {
    newProjectJson.pages[pageIdx].puckData = {
        ...newProjectJson.pages[pageIdx].puckData,
        content: pageContent
    };
  }

  const isLastPage = currentIndex === state.pages_to_expand!.length - 1;

  return {
    messages: [new AIMessage({ 
      id: generateMsgId(), 
      content: errorMsg 
        ? `⚠️ "${currentPage.seo?.title || currentPage.title}" 生成时遇到问题: ${errorMsg}`
        : `✨ 已完成 "${currentPage.seo?.title || currentPage.title}" 页面的 SEO 内容生成 (${currentIndex + 1}/${state.pages_to_expand!.length})` 
    })],
    project_json: newProjectJson,
    current_page_index: currentIndex + 1,
    phase: isLastPage ? "seo_optimization" : "expanding",
    validation_error: errorMsg || undefined
  };
};

// 4. SEO Node: Refines Meta Data & Summarizes content
const seoNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log("--- SEO Node Started ---");
    const model = getModel();
    const projectJson = { ...state.project_json };

    const systemPrompt = `你现在正在执行 SEO_OPTIMIZATION (全站优化) 阶段。
    你的任务是根据已经生成的页面内容，精修每个页面的 SEO Meta 数据。
    
    ### 任务：
    1. **摘要生成**：根据 puckData.content 中的实际文本内容，为每个页面生成 150-160 字符的高质量 Meta Description。
    2. **标题精修**：确保标题包含品牌名和页面核心关键词。
    3. **关键词提取**：分析全站内容，提取 10 个全站核心关键词。
    
    ### 当前全站数据：
    ${JSON.stringify(projectJson.pages.map((p: any) => ({ path: p.path, content_preview: p.puckData.content.slice(0, 2) })))}
    
    ### 要求：
    返回一个 JSON 对象，结构如下：
    {
      "pages": [ { "path": "...", "seo": { "title": "...", "description": "..." } }, ... ],
      "global_keywords": ["...", "..."]
    }
    `;

    const response = await model.invoke([new SystemMessage(systemPrompt)]);
    try {
        const seoResult = parseLLMJson(response.content.toString());
        
        // 深度克隆并更新 SEO 数据，确保不破坏 branding 等其他结构
        const updatedPages = projectJson.pages.map((p: any) => {
            const seoMatch = seoResult.pages?.find((sp: any) => sp.path === p.path);
            if (seoMatch) {
                return { ...p, seo: seoMatch.seo };
            }
            return p;
        });

        projectJson.pages = updatedPages;
        const injected = injectOrganizationJsonLd(projectJson);

        return {
            messages: [new AIMessage({ id: generateMsgId(), content: "🔍 已完成全站 SEO 深度优化与元数据精修。" })],
            project_json: injected,
            seo_keywords: seoResult.global_keywords,
            phase: "linter"
        };
    } catch (e) {
        console.error("SEO Node Error", e);
        return { project_json: state.project_json ? injectOrganizationJsonLd(state.project_json) : undefined, phase: "linter" }; // 如果 SEO 优化失败，直接跳到 Linter
    }
};

const deployNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log("--- Deploy Node Started ---");
    
    if (!state.project_json) {
        return {
            messages: [new AIMessage({ 
                id: generateMsgId(),
                content: "❌ 部署失败：未找到网站配置数据。请先生成网站预览。" 
            })],
            phase: "end"
        };
    }

    try {
        // Normalize project name
        const rawName = state.project_json.branding?.name?.toLowerCase() || 'site';
        const sanitizedName = rawName
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        
        // Strategy: Consistent Project Name (Req 6)
        // If we have a user_id, use it to namespace the project so it persists across sessions.
        // If anonymous, use a session-unique ID (which means reloading the page might lose it, but that's expected for anon).
        let projectSuffix = "";
        if (state.user_id) {
            // Use first 8 chars of user_id for stability
            projectSuffix = `-${state.user_id.slice(0, 8)}`;
        } else {
            // Fallback for anonymous: Use a hash of the name? No, that collides.
            // Use a random ID, but ideally we want to keep it if we redeploy in same session.
            // We can check if we already have a deployed_url and extract it?
            // Or just generate a new one for now.
            projectSuffix = `-${generateMsgId()}`;
        }
        
        // Ensure name isn't too long (Cloudflare limit 58 chars)
        // Prefix "shpitto-" (9 chars) + suffix (9 chars) = 18 chars reserved.
        // Max name length = 40.
        const safeName = sanitizedName.slice(0, 35);
        const projectName = `shpitto-${safeName}${projectSuffix}`;
        
        console.log(`[Deploy] Target Project: ${projectName}`);
        
        // 1. Save Project State (Req 5)
        let dbProjectId: string | undefined = state.db_project_id;
        if (state.user_id) {
            try {
                console.log(`[Deploy] Saving project state to Supabase (User: ${state.user_id})...`);
                // Pass existing ID if we have it
                dbProjectId = await saveProjectState(state.user_id, state.project_json, state.access_token, state.db_project_id);
                console.log(`[Deploy] Project saved. ID: ${dbProjectId}`);
            } catch (err) {
                console.error("Failed to save project state:", err);
                // Don't block deployment if save fails, but warn
            }
        }

        // Notify frontend
        const startMessage = new AIMessage({
            id: generateMsgId(),
            content: "🚀 正在启动一键部署流程... 请稍候。",
            tool_calls: [{
                id: `call_${generateMsgId()}`,
                name: "startDeployment",
                args: {}
            }]
        });

        const bundle = await Bundler.createBundle(state.project_json);
        
        console.log(`[Deploy] Uploading to Cloudflare...`);
        const cf = new CloudflareClient();
        
        // 2. Create/Get Cloudflare Project
        await cf.createProject(projectName);
        
        // 3. Upload deployment
        const deployResult = await cf.uploadDeployment(projectName, bundle);
        
        const url = `https://${projectName}.pages.dev`;
        console.log(`[Deploy] ✅ Deployed to: ${url}`);

        // 4. Record Deployment (Req 5)
        if (dbProjectId && state.user_id) {
            try {
                await recordDeployment(dbProjectId, url, 'production', state.access_token);
            } catch (err) {
                console.error("Failed to record deployment:", err);
            }
        }

        const actions = [
            {
                text: "View Live Site",
                payload: url,
                type: "url"
            }
        ];

        return {
            messages: [
                startMessage,
                new AIMessage({ 
                    id: generateMsgId(), 
                    content: `🚀 部署成功！您的站点已上线：${url}`,
                    additional_kwargs: {
                        actions
                    },
                    tool_calls: [{
                        id: `call_${generateMsgId()}`,
                        name: "presentActions",
                        args: { actions }
                    }]
                }),
                new AIMessage({
                    id: generateMsgId(),
                    content: "",
                    tool_calls: [{
                        id: `call_${generateMsgId()}`,
                        name: "notifyDeploymentStatus",
                        args: { 
                            status: "success", 
                            url: url, 
                            message: "Deployment successful!" 
                        }
                    }]
                })
            ],
            deployed_url: url,
            phase: "end",
            db_project_id: dbProjectId
        };
    } catch (error: any) {
        console.error("Deploy Node Error:", error);
        return {
            messages: [new AIMessage({ 
                id: generateMsgId(), 
                content: `❌ 部署遇到问题: ${error.message || "未知错误"}`
            })],
            phase: "end"
        };
    }
};

const linterNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Linter Node Started ---");
  if (!state.project_json) {
    return {
      messages: [new AIMessage({ id: generateMsgId(), content: "❌ 未找到可预览的数据，请先生成网站。" })],
      phase: "conversation",
    };
  }

  const validation = ProjectSchema.safeParse(state.project_json);
  const validationError = validation.success ? undefined : validation.error.message;

  const actions = [
    {
      text: "🚀 Deploy to Cloudflare",
      payload: "deploy",
      type: "button",
    },
  ];

  return {
    messages: [
      new AIMessage({
        id: generateMsgId(),
        content: validationError
          ? "⚠️ 已生成预览，但仍存在部分 schema 校验问题；你可以先查看效果，再继续修改。"
          : "✅ 预览已生成，你可以继续提修改意见，或直接部署。",
        additional_kwargs: { actions },
        tool_calls: [{ id: `call_actions_${generateMsgId()}`, name: "presentActions", args: { actions } }],
      }),
      new AIMessage({
        id: generateMsgId(),
        content: "",
        additional_kwargs: { projectJson: state.project_json },
        tool_calls: [
          { id: `call_preview_${generateMsgId()}`, name: "showWebsitePreview", args: { projectJson: state.project_json } },
        ],
      }),
    ],
    validation_error: validationError,
    phase: "end",
  };
};

// 6. Image Update Node: Scans for image placeholders and requests updates
const imageUpdateNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log("--- Image Update Node Started ---");
    if (!state.project_json) return { phase: "end" };

    // Scan all pages for components with image props
    const imageSlots: any[] = [];
    state.project_json.pages.forEach((page: any) => {
        page.puckData?.content?.forEach((comp: any) => {
            if (comp.props?.image) {
                imageSlots.push({
                    id: comp.id || `${comp.type}-${Math.random().toString(36).substr(2, 9)}`,
                    page: page.path,
                    section: comp.props.title || comp.type,
                    currentUrl: comp.props.image,
                    type: "single"
                });
            }
            if (comp.props?.items) {
                comp.props.items.forEach((item: any, idx: number) => {
                    if (item.image) {
                        imageSlots.push({
                            id: `${comp.id}-item-${idx}`,
                            page: page.path,
                            section: `${comp.props.title || comp.type} - Item ${idx + 1}`,
                            currentUrl: item.image,
                            type: "item"
                        });
                    }
                    if (item.logo) {
                        imageSlots.push({
                            id: `${comp.id}-logo-${idx}`,
                            page: page.path,
                            section: `${comp.props.title || comp.type} - Logo ${idx + 1}`,
                            currentUrl: item.logo,
                            type: "logo"
                        });
                    }
                });
            }
        });
    });

    if (imageSlots.length === 0) return { phase: "end" };

    const actions = [
        {
            text: "🖼️ Update Website Images",
            payload: {
                type: "image_update",
                slots: imageSlots
            },
            type: "form"
        }
    ];

    console.log(`[Image Update] Found ${imageSlots.length} image slots.`);

    return {
        messages: [
            new AIMessage({
                id: generateMsgId(),
                content: `📸 网站内容已就绪。为了让效果更完美，我检测到有 ${imageSlots.length} 处图片可以使用您的素材进行替换。`,
                tool_calls: [{
                    id: `call_${generateMsgId()}`,
                    name: "presentActions",
                    args: { actions }
                }]
            })
        ],
        phase: "end"
    };
};

// --- Graph Construction ---

const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
    phase: {
        value: (x: string, y: string) => y ?? x,
        default: () => "conversation",
    },
    project_outline: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => "",
    },
    project_json: {
        value: (x?: any, y?: any) => y ?? x,
        default: () => null,
    },
    track_results: {
        value: (x?: any[], y?: any[]) => y ?? x,
        default: () => [],
    },
    patch_request: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    sitemap: {
        value: (x?: any, y?: any) => y ?? x,
        default: () => undefined,
    },
    industry: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    theme: {
        value: (x?: any, y?: any) => y ?? x,
        default: () => undefined,
    },
    history: {
        value: (x?: string[], y?: string[]) => y ?? x,
        default: () => [],
    },
    pages_to_expand: {
        value: (x?: string[], y?: string[]) => y ?? x,
        default: () => [],
    },
    current_page_index: {
        value: (x: number, y: number) => y,
        default: () => 0,
    },
    seo_keywords: {
        value: (x?: string[], y?: string[]) => y ?? x,
        default: () => [],
    },
    validation_error: {
        value: (x?: string, y?: string) => y,
        default: () => undefined,
    },
    attempt_count: {
        value: (x: number, y: number) => y,
        default: () => 0,
    },
    deployed_url: {
        value: (x?: string, y?: string) => y,
        default: () => undefined,
    },
    user_id: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    access_token: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    db_project_id: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    }
  }
})
  .addNode("conversation", conversationNode)
  .addNode("skeleton", skeletonNode)
  .addNode("parallel", parallelNode)
  .addNode("stitcher", stitcherNode)
  .addNode("liner", linerNode)
  .addNode("seo_optimization", seoNode)
  .addNode("linter", linterNode)
  .addNode("patch", patchNode)
  .addNode("deploy", deployNode);

workflow.addEdge(START, "conversation");

workflow.addConditionalEdges(
  "conversation",
  (state) => {
      if (state.phase === "skeleton") return "skeleton";
      if (state.phase === "deploy") return "deploy";
      if (state.phase === "patch") return "patch";
      return END;
  }
);

workflow.addEdge("skeleton", "parallel");
workflow.addEdge("parallel", "stitcher");
workflow.addEdge("stitcher", "liner");
workflow.addEdge("liner", "seo_optimization");
workflow.addEdge("patch", "liner");

workflow.addEdge("seo_optimization", "linter");
workflow.addEdge("deploy", END);

workflow.addEdge("linter", END);

export const graph = workflow.compile();
