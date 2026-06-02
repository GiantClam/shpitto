import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { ContractVerificationResult, RouteUnitVerificationRecord } from "./contract-violation.ts";
import type { ImmutableGenerationContract } from "./generation-contract.ts";
import type { GenerationUnitInput } from "./generation-worker-adapter.ts";
import type { SkillRuntimeExecutionSummary } from "./executor.ts";

export function routeCheckpointSlug(route: string): string {
  const normalized = String(route || "/").trim();
  if (!normalized || normalized === "/") return "route-home";
  return `route-${normalized.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-")}`;
}

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function htmlPathToRoute(htmlPath: string): string {
  const normalized = normalizePath(htmlPath);
  if (normalized === "/index.html") return "/";
  return normalized.replace(/\/index\.html$/i, "") || "/";
}

function guessFileType(filePath: string): string {
  const normalized = normalizePath(filePath).toLowerCase();
  if (normalized.endsWith(".html")) return "text/html";
  if (normalized.endsWith(".css")) return "text/css";
  if (normalized.endsWith(".js")) return "application/javascript";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

type PersistedStepSnapshot = {
  stepKey?: string;
  stepIndex?: number;
  totalSteps?: number;
  status?: string;
  files?: Array<{ path?: string; content?: string; type?: string }>;
  pages?: Array<{ path?: string; html?: string }>;
};

async function writeJson(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeGenerationContractCheckpoint(checkpointDir: string, contract: ImmutableGenerationContract) {
  const filePath = path.join(path.resolve(checkpointDir), "generation-contract.json");
  await writeJson(filePath, contract);
  return filePath;
}

export async function writeRouteUnitInputCheckpoint(
  checkpointDir: string,
  route: string,
  generationUnit: GenerationUnitInput,
) {
  const filePath = path.join(path.resolve(checkpointDir), `${routeCheckpointSlug(route)}.input.json`);
  await writeJson(filePath, generationUnit);
  return filePath;
}

export async function writeRouteUnitVerificationCheckpoint(
  checkpointDir: string,
  record: RouteUnitVerificationRecord,
) {
  const filePath = path.join(path.resolve(checkpointDir), `${routeCheckpointSlug(record.route)}.verification.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeGenerationVerificationCheckpoint(
  checkpointDir: string,
  verification: ContractVerificationResult,
) {
  const filePath = path.join(path.resolve(checkpointDir), "generation-verification.json");
  await writeJson(filePath, verification);
  return filePath;
}

export async function writeGenerationExecutionCheckpoint(
  checkpointDir: string,
  execution: SkillRuntimeExecutionSummary,
) {
  const filePath = path.join(path.resolve(checkpointDir), "generation-execution.json");
  await writeJson(filePath, execution);
  return filePath;
}

export async function writeGeneratedProjectCheckpoint(checkpointDir: string, project: unknown) {
  const filePath = path.join(path.resolve(checkpointDir), "generated-project.json");
  await writeJson(filePath, project);
  return filePath;
}

export async function readGenerationContractCheckpoint(checkpointDir: string) {
  return readJson<ImmutableGenerationContract>(path.join(path.resolve(checkpointDir), "generation-contract.json"));
}

export async function readGenerationVerificationCheckpoint(checkpointDir: string) {
  return readJson<ContractVerificationResult>(path.join(path.resolve(checkpointDir), "generation-verification.json"));
}

export async function readGenerationExecutionCheckpoint(checkpointDir: string) {
  return readJson<SkillRuntimeExecutionSummary>(path.join(path.resolve(checkpointDir), "generation-execution.json"));
}

export async function readGeneratedProjectCheckpoint<T = unknown>(checkpointDir: string) {
  return readJson<T>(path.join(path.resolve(checkpointDir), "generated-project.json"));
}

export async function readRouteUnitInputCheckpoint(checkpointDir: string, route: string) {
  return readJson<GenerationUnitInput>(
    path.join(path.resolve(checkpointDir), `${routeCheckpointSlug(route)}.input.json`),
  );
}

export async function readRouteUnitVerificationCheckpoint(checkpointDir: string, route: string) {
  return readJson<RouteUnitVerificationRecord>(
    path.join(path.resolve(checkpointDir), `${routeCheckpointSlug(route)}.verification.json`),
  );
}

export async function readAllRouteUnitVerificationCheckpoints(checkpointDir: string, routes: string[]) {
  const records = await Promise.all(routes.map((route) => readRouteUnitVerificationCheckpoint(checkpointDir, route)));
  return records.filter(Boolean) as RouteUnitVerificationRecord[];
}

async function collectFilesRecursively(rootDir: string, currentDir = rootDir): Promise<Array<{ path: string; content: string; type: string }>> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }

  const files: Array<{ path: string; content: string; type: string }> = [];
  for (const entry of entries) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursively(rootDir, abs)));
      continue;
    }
    const rel = path.relative(rootDir, abs).replace(/\\/g, "/");
    const content = await fs.readFile(abs, "utf8");
    files.push({
      path: normalizePath(rel),
      content,
      type: guessFileType(rel),
    });
  }
  return files;
}

function buildRecoveredProjectFromFiles(
  files: Array<{ path: string; content: string; type: string }>,
  preferredPages?: Array<{ path?: string; html?: string }>,
) {
  const uniqueFiles = new Map<string, { path: string; content: string; type: string }>();
  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (!normalizedPath || normalizedPath === "/") continue;
    uniqueFiles.set(normalizedPath, {
      path: normalizedPath,
      content: String(file.content || ""),
      type: String(file.type || guessFileType(normalizedPath)),
    });
  }

  const pagesByRoute = new Map<string, { path: string; html: string }>();
  for (const file of uniqueFiles.values()) {
    if (!file.path.toLowerCase().endsWith(".html")) continue;
    const route = htmlPathToRoute(file.path);
    pagesByRoute.set(route, {
      path: route,
      html: file.content,
    });
  }
  for (const page of preferredPages || []) {
    const route = normalizePath(String(page?.path || ""));
    if (!route || route === "/") {
      if (String(page?.html || "").trim()) {
        pagesByRoute.set("/", { path: "/", html: String(page?.html || "") });
      }
      continue;
    }
    if (String(page?.html || "").trim()) {
      pagesByRoute.set(route, { path: route, html: String(page?.html || "") });
    }
  }

  return {
    projectId: "recovered-route-unit-site",
    pages: Array.from(pagesByRoute.values()),
    staticSite: {
      mode: "route-unit-v2",
      files: Array.from(uniqueFiles.values()),
    },
  };
}

export async function recoverGeneratedProjectCheckpoint(checkpointDir: string) {
  const resolvedCheckpointDir = path.resolve(checkpointDir);
  const siteDir = path.join(resolvedCheckpointDir, "site");
  const siteFiles = await collectFilesRecursively(siteDir);
  if (siteFiles.length > 0) {
    return buildRecoveredProjectFromFiles(siteFiles);
  }

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(resolvedCheckpointDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }

  const snapshotFiles = entries
    .filter((entry) => entry.isFile() && /^\d{2,3}-.*\.json$/i.test(entry.name))
    .map((entry) => path.join(resolvedCheckpointDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
  if (snapshotFiles.length === 0) return null;

  const mergedFiles = new Map<string, { path: string; content: string; type: string }>();
  const mergedPages = new Map<string, { path: string; html: string }>();
  for (const snapshotPath of snapshotFiles) {
    const snapshot = await readJson<PersistedStepSnapshot>(snapshotPath);
    if (!snapshot) continue;
    for (const file of snapshot.files || []) {
      const normalizedPath = normalizePath(String(file?.path || ""));
      if (!normalizedPath || normalizedPath === "/") continue;
      mergedFiles.set(normalizedPath, {
        path: normalizedPath,
        content: String(file?.content || ""),
        type: String(file?.type || guessFileType(normalizedPath)),
      });
    }
    for (const page of snapshot.pages || []) {
      const route = normalizePath(String(page?.path || ""));
      if (!route) continue;
      const html = String(page?.html || "");
      if (!html.trim()) continue;
      mergedPages.set(route, {
        path: route,
        html,
      });
    }
  }

  if (mergedFiles.size === 0) return null;
  return buildRecoveredProjectFromFiles(Array.from(mergedFiles.values()), Array.from(mergedPages.values()));
}
