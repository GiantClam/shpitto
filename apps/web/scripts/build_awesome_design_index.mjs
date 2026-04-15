#!/usr/bin/env node

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

function findRepoRoot(start = process.cwd()) {
  let current = path.resolve(start);
  for (let i = 0; i < 8; i += 1) {
    const hasWorkspace = existsSync(path.join(current, "pnpm-workspace.yaml"));
    const hasGit = existsSync(path.join(current, ".git"));
    if (hasWorkspace || hasGit) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

async function awaitExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeDescription(description) {
  const base = String(description || "").trim();
  if (base) return base;
  return "Locally bundled design template for website-generation-workflow.";
}

async function ensureLocalDesignTemplates({
  templateRoot,
  snapshotStyles,
}) {
  await fs.mkdir(templateRoot, { recursive: true });

  const missingSlugs = [];
  for (const style of snapshotStyles) {
    const slug = String(style.slug || "").trim();
    if (!slug) continue;
    const dir = path.join(templateRoot, slug);
    const designFile = path.join(dir, "DESIGN.md");
    const readmeFile = path.join(dir, "README.md");
    const hasDesign = await awaitExists(designFile);
    const hasReadme = await awaitExists(readmeFile);
    if (!hasDesign && !hasReadme) {
      missingSlugs.push(slug);
    }
  }

  return { missingSlugs };
}

async function listLocalTemplateSlugs(templateRoot) {
  if (!(await awaitExists(templateRoot))) return [];

  const entries = await fs.readdir(templateRoot, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const designPath = path.join(templateRoot, slug, "DESIGN.md");
    const readmePath = path.join(templateRoot, slug, "README.md");
    if ((await awaitExists(designPath)) || (await awaitExists(readmePath))) {
      slugs.push(slug);
    }
  }
  return slugs.sort((a, b) => a.localeCompare(b, "en"));
}

async function resolveDesignFile(templateRoot, slug) {
  const candidates = [
    path.join(templateRoot, slug, "DESIGN.md"),
    path.join(templateRoot, slug, "README.md"),
  ];
  for (const candidate of candidates) {
    if (await awaitExists(candidate)) return candidate;
  }
  return null;
}

function toCategoryFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "uncategorized";
}

function buildMarkdownIndex(indexData) {
  const { generatedAt, totalStyles, categories } = indexData;
  const lines = [];
  lines.push("# Awesome Design MD Index (Local)");
  lines.push("");
  lines.push(`- Generated at: ${generatedAt}`);
  lines.push(`- Total styles: ${totalStyles}`);
  lines.push("");
  lines.push("## Categories");
  lines.push("");
  for (const category of categories) {
    lines.push(`- ${category.name} (${category.styles.length})`);
  }
  lines.push("");
  for (const category of categories) {
    lines.push(`## ${category.name}`);
    lines.push("");
    for (const style of category.styles) {
      lines.push(`- **${style.name}** (${style.slug})`);
      lines.push(`  - ${style.description}`);
      lines.push(`  - local path: ${style.designMdPath}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const repoRoot = findRepoRoot(process.cwd());
  const outputDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repoRoot, ".cache", "awesome-design-md");

  const workflowSkillRoot = path.join(repoRoot, "apps", "web", "skills", "website-generation-workflow");
  const snapshotPath =
    process.env.AWESOME_DESIGN_SNAPSHOT_PATH ||
    path.join(workflowSkillRoot, "awesome-design.snapshot.json");
  const localIndexPath =
    process.env.AWESOME_DESIGN_LOCAL_INDEX_PATH ||
    path.join(workflowSkillRoot, "awesome-design.local.index.json");
  const templateRoot =
    process.env.AWESOME_DESIGN_TEMPLATE_ROOT ||
    path.join(workflowSkillRoot, "awesome-design-md", "design-md");
  const categoriesDir = path.join(outputDir, "categories");

  const snapshotRaw = await fs.readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(snapshotRaw);
  const snapshotStyles = Array.isArray(snapshot.styles) ? snapshot.styles : [];
  const metadataBySlug = new Map(snapshotStyles.map((style) => [style.slug, style]));

  const templateSyncResult = await ensureLocalDesignTemplates({
    templateRoot,
    snapshotStyles,
  });
  if (templateSyncResult.missingSlugs.length > 0) {
    throw new Error(
      `Missing local design templates under ${templateRoot}. Missing slugs: ${templateSyncResult.missingSlugs.slice(0, 12).join(", ")}${templateSyncResult.missingSlugs.length > 12 ? " ..." : ""}`,
    );
  }

  const slugs = await listLocalTemplateSlugs(templateRoot);
  if (slugs.length === 0) {
    throw new Error(`No local awesome-design templates found under ${templateRoot}`);
  }

  const styles = [];
  for (const slug of slugs) {
    const metadata = metadataBySlug.get(slug) || {};
    const designFile = await resolveDesignFile(templateRoot, slug);
    if (!designFile) continue;

    styles.push({
      name: metadata.name || slug,
      slug,
      category: metadata.category || "local-bundled",
      description: normalizeDescription(metadata.description),
      sourceUrl: metadata.sourceUrl || `local://awesome-design-md/design-md/${slug}`,
      previewUrl: metadata.previewUrl || `local://awesome-design-md/design-md/${slug}`,
      designMdUrl: `local://${path.relative(repoRoot, designFile).replace(/\\/g, "/")}`,
      designMdPath: path.relative(repoRoot, designFile).replace(/\\/g, "/"),
    });
  }

  const categoryMap = new Map();
  for (const style of styles) {
    if (!categoryMap.has(style.category)) categoryMap.set(style.category, []);
    categoryMap.get(style.category).push(style);
  }

  const categories = Array.from(categoryMap.entries())
    .map(([name, categoryStyles]) => ({
      name,
      styles: categoryStyles.sort((a, b) => a.name.localeCompare(b.name, "en")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  const indexData = {
    sourceRepo: "local://awesome-design-md",
    generatedAt: new Date().toISOString(),
    totalStyles: styles.length,
    categories,
    styles,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(categoriesDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, "index.json"), `${JSON.stringify(indexData, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outputDir, "index.md"), buildMarkdownIndex(indexData), "utf8");
  await fs.writeFile(localIndexPath, `${JSON.stringify(indexData, null, 2)}\n`, "utf8");

  for (const category of categories) {
    const fileName = `${toCategoryFilename(category.name)}.md`;
    const lines = [];
    lines.push(`# ${category.name}`);
    lines.push("");
    lines.push(`- Style count: ${category.styles.length}`);
    lines.push("");
    for (const style of category.styles) {
      lines.push(`- **${style.name}** (${style.slug})`);
      lines.push(`  - ${style.description}`);
      lines.push(`  - ${style.designMdPath}`);
    }
    lines.push("");
    await fs.writeFile(path.join(categoriesDir, fileName), `${lines.join("\n")}\n`, "utf8");
  }

  const summary = {
    outputDir,
    localIndexPath,
    templateRoot,
    createdTemplates: 0,
    totalStyles: styles.length,
    categoryCount: categories.length,
    files: {
      indexJson: path.join(outputDir, "index.json"),
      indexMd: path.join(outputDir, "index.md"),
      categoriesDir,
    },
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[build_awesome_design_index] ${error.stack || error.message}\n`);
  process.exit(1);
});
