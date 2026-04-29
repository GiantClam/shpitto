import {
  getWebsiteGenerationSkillBundle,
  loadProjectSkill,
  resolveProjectSkillAlias,
  WEBSITE_GENERATION_SKILL_BUNDLE,
  type ProjectSkillDescriptor,
} from "./project-skill-loader.ts";
import { renderWebsiteSkillMetadataPrompt } from "./od-skill-metadata.ts";
import { resolveSerperSearchConfigFromEnv, searchSerper, type WebSearchSource } from "../tools/web-search/serper.ts";

export type SkillToolName = "load_skill" | "emit_file" | "web_search" | "finish";

export type SkillToolCall = {
  id?: string;
  name: SkillToolName;
  args?: Record<string, unknown>;
};

export type SkillToolFile = {
  path: string;
  content: string;
  type: string;
};

type SkillToolLoadResult = {
  kind: "skill";
  toolResult: string;
  skillId: string;
};

type SkillToolFileResult = {
  kind: "file";
  toolResult: string;
  file: SkillToolFile;
};

type SkillToolFinishResult = {
  kind: "finish";
  toolResult: string;
};

type SkillToolSearchResult = {
  kind: "search";
  toolResult: string;
  query: string;
  sources: WebSearchSource[];
};

export type SkillToolResult =
  | SkillToolLoadResult
  | SkillToolFileResult
  | SkillToolSearchResult
  | SkillToolFinishResult;

export type SkillToolHandlerContext = {
  loadedSkills: Map<string, string>;
  maxSkillChars?: number;
  maxFileChars?: number;
};

export const SKILL_TOOL_DEFINITIONS = [
  {
    name: "load_skill",
    description: "Load a project skill and return its SKILL.md content.",
    parameters: {
      type: "object",
      properties: {
        skill_id: {
          type: "string",
          description: [
            "Skill id, SKILL.md frontmatter name, or trigger to load from apps/web/skills.",
            `Core skills: ${WEBSITE_GENERATION_SKILL_BUNDLE.join(", ")}.`,
            "Website seed skills are discovered dynamically from od.mode=website frontmatter.",
            "Document content skills (pdf, docx, pptx) are available when uploaded source files require extraction or interpretation.",
          ].join(" "),
        },
      },
      required: ["skill_id"],
      additionalProperties: false,
    },
  },
  {
    name: "emit_file",
    description: "Emit one generated file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute site file path, e.g. /index.html" },
        content: { type: "string", description: "Full file content." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "web_search",
    description: "Search the web via Serper and return concise sources for grounding.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query in natural language." },
        num: { type: "integer", minimum: 1, maximum: 10, description: "Number of results to return." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "finish",
    description: "Signal generation complete.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

const DEFAULT_MAX_SKILL_CHARS = Math.max(2_000, Number(process.env.SKILL_TOOL_MAX_SKILL_CHARS || 12_000));
const DEFAULT_MAX_FILE_CHARS = Math.max(4_000, Number(process.env.SKILL_TOOL_MAX_FILE_CHARS || 280_000));
const DEFAULT_MAX_SEARCH_CHARS = Math.max(1_000, Number(process.env.SKILL_TOOL_MAX_SEARCH_CHARS || 8_000));

function clipText(text: string, maxChars: number): string {
  const raw = String(text || "");
  if (!raw) return "";
  if (!Number.isFinite(maxChars) || maxChars <= 0) return raw;
  if (raw.length <= maxChars) return raw;
  const kept = Math.max(500, maxChars - 96);
  return `${raw.slice(0, kept)}\n\n[truncated due to context budget]`;
}

function normalizePath(rawPath: string): string {
  const withSlash = String(rawPath || "").trim().startsWith("/")
    ? String(rawPath || "").trim()
    : `/${String(rawPath || "").trim()}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function guessMimeByPath(filePath: string): string {
  const normalized = String(filePath || "").toLowerCase();
  if (normalized.endsWith(".html")) return "text/html";
  if (normalized.endsWith(".css")) return "text/css";
  if (normalized.endsWith(".js")) return "text/javascript";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

function stripMarkdownCodeFences(raw: string): string {
  const text = String(raw || "").trim();
  const fenced = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*)\n```\s*$/);
  if (fenced?.[1]) return fenced[1].trim();
  const openOnly = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*)$/);
  if (openOnly?.[1]) return openOnly[1].trim();
  return text;
}

function containsToolTranscriptNoise(raw: string): boolean {
  const text = String(raw || "");
  if (!text.trim()) return false;
  return /<tool_call>|<tool_response>|```|("name"\s*:\s*"(?:fetchUrl|webSearch|web_search|load_skill|emit_file|finish)")/i.test(text);
}

function validateAndSanitizeFileContent(filePath: string, rawContent: string): string {
  const normalizedPath = String(filePath || "").toLowerCase();
  const content = stripMarkdownCodeFences(rawContent);
  if (containsToolTranscriptNoise(content)) {
    throw new Error(`emit_file.content contains tool transcript noise: ${filePath}`);
  }

  if (normalizedPath.endsWith(".js")) {
    try {
      // Syntax check only. Does not execute generated code.
      new Function(content);
    } catch (error: any) {
      throw new Error(`emit_file.content is invalid JavaScript (${filePath}): ${String(error?.message || error)}`);
    }
  }

  if (normalizedPath.endsWith(".css")) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error(`emit_file.content is empty CSS: ${filePath}`);
    }
    if (/<\/?(?:html|head|body|script)\b/i.test(trimmed)) {
      throw new Error(`emit_file.content looks like HTML/JS, not CSS: ${filePath}`);
    }
  }

  return content;
}

function assertValidOutputPath(rawPath: string): string {
  const normalized = normalizePath(rawPath);
  if (!normalized || normalized === "/") {
    throw new Error("emit_file.path must be a concrete file path.");
  }
  if (normalized.includes("..")) {
    throw new Error(`emit_file.path must not include '..': ${normalized}`);
  }
  if (!/\.[a-z0-9]+$/i.test(normalized)) {
    throw new Error(`emit_file.path must include an extension: ${normalized}`);
  }
  return normalized;
}

async function loadAllowedWebsiteSkill(skillId: string): Promise<ProjectSkillDescriptor> {
  const skill = await loadProjectSkill(skillId);
  const allowSet = new Set((await getWebsiteGenerationSkillBundle()).map((id) => resolveProjectSkillAlias(id)));
  if (!allowSet.has(skill.id) && skill.websiteMetadata?.mode !== "website") {
    throw new Error(`skill "${skill.id}" is not allowed in website generation bundle.`);
  }
  return skill;
}

export function buildSkillToolSystemInstructions(): string {
  const toolsDigest = SKILL_TOOL_DEFINITIONS.map((tool) => {
    const required = Array.isArray((tool.parameters as any)?.required)
      ? (tool.parameters as any).required.join(", ")
      : "";
    return `- ${tool.name}: ${tool.description}${required ? ` (required: ${required})` : ""}`;
  }).join("\n");

  return [
    "You must operate by emitting tool calls.",
    "Use `web_search` when factual grounding helps before generating final files, including publicly researchable gaps identified by the loaded workflow skill or Evidence Brief.",
    "Use `load_skill` before each major generation task (styles, script, and each page batch).",
    "Use `emit_file` to output every final artifact.",
    "When all required files are emitted, call `finish`.",
    "",
    "Tools:",
    toolsDigest,
  ].join("\n");
}

export async function handleSkillToolCall(
  call: SkillToolCall,
  context: SkillToolHandlerContext,
): Promise<SkillToolResult> {
  if (call.name === "finish") {
    return { kind: "finish", toolResult: "ok: finish" };
  }

  if (call.name === "load_skill") {
    const rawSkillId = String(call.args?.skill_id || "").trim();
    if (!rawSkillId) throw new Error("load_skill requires skill_id.");
    const skill = await loadAllowedWebsiteSkill(rawSkillId);
    const resolvedSkillId = skill.id;
    const cached = context.loadedSkills.get(resolvedSkillId);
    if (cached) {
      return {
        kind: "skill",
        skillId: resolvedSkillId,
        toolResult: [
          `Skill ${resolvedSkillId} already loaded.`,
          "Do not reload repeatedly.",
          "Next action: call emit_file(path, content) for required files.",
        ].join("\n"),
      };
    }
    const metadataPrompt = skill.websiteMetadata ? renderWebsiteSkillMetadataPrompt(skill.websiteMetadata) : "";
    const payload = [
      `# skill:${resolvedSkillId}`,
      "",
      metadataPrompt,
      metadataPrompt ? "" : undefined,
      clipText(skill.content, Number(context.maxSkillChars || DEFAULT_MAX_SKILL_CHARS)),
    ]
      .filter((part): part is string => typeof part === "string")
      .join("\n");
    context.loadedSkills.set(resolvedSkillId, payload);
    return {
      kind: "skill",
      skillId: resolvedSkillId,
      toolResult: payload,
    };
  }

  if (call.name === "web_search") {
    const query = String(call.args?.query || "").trim();
    if (!query) throw new Error("web_search requires query.");
    const resolved = resolveSerperSearchConfigFromEnv();
    if (!resolved.config) throw new Error(resolved.reason || "missing_serper_config");
    const num = Math.max(1, Math.min(10, Number(call.args?.num || resolved.config.num)));
    const sources = await searchSerper(query, {
      config: resolved.config,
      num,
    });
    const payload = clipText(
      JSON.stringify(
        {
          query,
          sources: sources.map((item) => ({
            title: item.title,
            url: item.url,
            snippet: item.snippet || "",
          })),
        },
        null,
        2,
      ),
      DEFAULT_MAX_SEARCH_CHARS,
    );
    return {
      kind: "search",
      query,
      sources,
      toolResult: `web_search_result\n${payload}`,
    };
  }

  const outputPath = assertValidOutputPath(String(call.args?.path || ""));
  const rawContent = String(call.args?.content || "");
  const content = validateAndSanitizeFileContent(outputPath, rawContent);
  const maxChars = Number(context.maxFileChars || DEFAULT_MAX_FILE_CHARS);
  if (content.length > maxChars) {
    throw new Error(`emit_file.content exceeds max size (${content.length} > ${maxChars}).`);
  }
  return {
    kind: "file",
    file: {
      path: outputPath,
      content,
      type: guessMimeByPath(outputPath),
    },
    toolResult: `ok: emitted ${outputPath}`,
  };
}
