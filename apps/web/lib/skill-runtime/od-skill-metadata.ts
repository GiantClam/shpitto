export type WebsiteSkillMetadata = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  mode: "website";
  platform?: string;
  scenario?: string;
  preview?: {
    type?: string;
    entry?: string;
  };
  designSystem?: {
    requires?: boolean;
    sections?: string[];
  };
};

export type SkillFrontmatterSummary = {
  name: string;
  description: string;
  triggers: string[];
};

type FrontmatterParseResult = {
  frontmatter: string;
  hasFrontmatter: boolean;
};

function extractFrontmatter(content: string): FrontmatterParseResult {
  const text = String(content || "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: "", hasFrontmatter: false };
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return {
    frontmatter: match?.[1] || "",
    hasFrontmatter: Boolean(match?.[1]),
  };
}

function readScalar(frontmatter: string, key: string): string {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match?.[1]) return "";
  return match[1].replace(/^["']|["']$/g, "").trim();
}

function readBlock(frontmatter: string, key: string): string {
  const lines = frontmatter.split(/\r?\n/g);
  const start = lines.findIndex((line) => line.trim() === `${key}: |` || line.trim() === `${key}: >`);
  if (start < 0) return readScalar(frontmatter, key);
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[a-zA-Z0-9_-]+:\s*/.test(line)) break;
    block.push(line.replace(/^\s{2}/, ""));
  }
  return block.join("\n").trim();
}

function readList(frontmatter: string, key: string): string[] {
  const lines = frontmatter.split(/\r?\n/g);
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[a-zA-Z0-9_-]+:\s*/.test(line)) break;
    const match = line.match(/^\s*-\s*(.+?)\s*$/);
    if (match?.[1]) items.push(match[1].replace(/^["']|["']$/g, "").trim());
  }
  return items.filter(Boolean);
}

function readOdBlock(frontmatter: string): string {
  const lines = frontmatter.split(/\r?\n/g);
  const start = lines.findIndex((line) => line.trim() === "od:");
  if (start < 0) return "";
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[a-zA-Z0-9_-]+:\s*/.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

function readIndentedScalar(block: string, key: string): string {
  const match = block.match(new RegExp(`^\\s+${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match?.[1]) return "";
  return match[1].replace(/^["']|["']$/g, "").trim();
}

function readNestedScalar(block: string, parent: string, key: string): string {
  const lines = block.split(/\r?\n/g);
  const start = lines.findIndex((line) => new RegExp(`^\\s+${parent}:\\s*$`).test(line));
  if (start < 0) return "";
  for (const line of lines.slice(start + 1)) {
    if (/^\s{2}\S/.test(line)) break;
    const match = line.match(new RegExp(`^\\s+${key}:\\s*(.+?)\\s*$`));
    if (match?.[1]) return match[1].replace(/^["']|["']$/g, "").trim();
  }
  return "";
}

function readNestedBoolean(block: string, parent: string, key: string): boolean | undefined {
  const value = readNestedScalar(block, parent, key).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function readNestedInlineList(block: string, parent: string, key: string): string[] {
  const raw = readNestedScalar(block, parent, key);
  const match = raw.match(/^\[(.*)\]$/);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function parseWebsiteSkillMetadata(skillId: string, content: string): WebsiteSkillMetadata | undefined {
  const { frontmatter, hasFrontmatter } = extractFrontmatter(content);
  if (!hasFrontmatter) return undefined;

  const odBlock = readOdBlock(frontmatter);
  if (!odBlock) return undefined;

  const mode = readIndentedScalar(odBlock, "mode").toLowerCase();
  if (mode !== "website") {
    throw new Error(`skill "${skillId}" has unsupported od.mode "${mode || "missing"}"; only "website" is allowed.`);
  }

  const name = readScalar(frontmatter, "name") || skillId;
  const description = readBlock(frontmatter, "description");
  const previewType = readNestedScalar(odBlock, "preview", "type");
  const previewEntry = readNestedScalar(odBlock, "preview", "entry");
  const requiresDesignSystem = readNestedBoolean(odBlock, "design_system", "requires");
  const designSystemSections = readNestedInlineList(odBlock, "design_system", "sections");

  return {
    id: skillId,
    name,
    description,
    triggers: readList(frontmatter, "triggers"),
    mode: "website",
    platform: readIndentedScalar(odBlock, "platform") || undefined,
    scenario: readIndentedScalar(odBlock, "scenario") || undefined,
    preview:
      previewType || previewEntry
        ? {
            type: previewType || undefined,
            entry: previewEntry || undefined,
          }
        : undefined,
    designSystem:
      typeof requiresDesignSystem === "boolean" || designSystemSections.length > 0
        ? {
            requires: requiresDesignSystem,
            sections: designSystemSections,
          }
        : undefined,
  };
}

export function parseSkillFrontmatterSummary(skillId: string, content: string): SkillFrontmatterSummary {
  const { frontmatter, hasFrontmatter } = extractFrontmatter(content);
  if (!hasFrontmatter) {
    return {
      name: skillId,
      description: "",
      triggers: [],
    };
  }
  return {
    name: readScalar(frontmatter, "name") || skillId,
    description: readBlock(frontmatter, "description"),
    triggers: readList(frontmatter, "triggers"),
  };
}

export function renderWebsiteSkillMetadataPrompt(metadata: WebsiteSkillMetadata): string {
  const lines = [
    "## Website Skill Contract",
    `- Skill: ${metadata.name} (${metadata.id}).`,
    "- Allowed mode: website only.",
    `- Responsive target: ${metadata.platform || "responsive"}. Output must work in desktop and mobile previews.`,
  ];

  if (metadata.scenario) lines.push(`- Scenario: ${metadata.scenario}.`);
  if (metadata.preview?.entry) lines.push(`- Preview entry: ${metadata.preview.entry}.`);
  if (metadata.designSystem?.requires) {
    lines.push("- A local design system reference must be applied before emitting final HTML/CSS.");
  }
  if (metadata.designSystem?.sections?.length) {
    lines.push(`- Required design-system sections: ${metadata.designSystem.sections.join(", ")}.`);
  }

  return lines.join("\n");
}
