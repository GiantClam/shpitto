import fs from "node:fs/promises";
import path from "node:path";

export type SourcePackageResult = {
  target: "source";
  workspaceRoot: string;
  packageRoot: string;
  fileCount: number;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
};

function safeToken(value: unknown, fallback: string): string {
  const token = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || fallback;
}

function isIncludedSourcePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized) return true;
  if (["node_modules", ".next", ".git", ".opencode"].some((name) => normalized === name || normalized.startsWith(`${name}/`))) return false;
  if (normalized === ".env" || (normalized.startsWith(".env.") && normalized !== ".env.example")) return false;
  if (normalized === ".shpitto/opencode-session.json") return false;
  return true;
}

async function countFiles(root: string): Promise<number> {
  let count = 0;
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) count += 1;
    }
  }
  await walk(root);
  return count;
}

export async function packageSourceWorkspace(params: {
  workspaceRoot: string;
  outputRoot?: string;
  packageName?: string;
}): Promise<SourcePackageResult> {
  const workspaceRoot = path.resolve(params.workspaceRoot);
  await fs.access(path.join(workspaceRoot, "package.json"));
  const packageRoot = path.resolve(
    params.outputRoot || path.join(workspaceRoot, "..", `${safeToken(params.packageName, "shpitto-source")}-${Date.now().toString(36)}`),
  );
  if (packageRoot === workspaceRoot || packageRoot.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Source package output must be outside the source workspace.");
  }
  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(packageRoot), { recursive: true });
  await fs.cp(workspaceRoot, packageRoot, {
    recursive: true,
    force: true,
    filter: (source) => isIncludedSourcePath(path.relative(workspaceRoot, source)),
  });
  const fileCount = await countFiles(packageRoot);
  await fs.writeFile(
    path.join(packageRoot, "SHPITTO-SOURCE-PACKAGE.json"),
    JSON.stringify(
      {
        target: "source",
        packageName: safeToken(params.packageName, "shpitto-source"),
        generatedAt: new Date().toISOString(),
        installCommand: "pnpm install",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
      },
      null,
      2,
    ),
    "utf8",
  );
  return {
    target: "source",
    workspaceRoot,
    packageRoot,
    fileCount: fileCount + 1,
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
  };
}
