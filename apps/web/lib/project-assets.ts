import fs from "node:fs/promises";
import path from "node:path";
import { getR2Client, type R2ListedObject } from "./r2.ts";

export type ProjectAssetSource = "upload" | "chat_upload" | "generated";
export type ProjectAssetCategory = "image" | "code" | "document" | "other";
export type ProjectAssetStatus = "published" | "modified" | "new";

export type ProjectAssetRecord = {
  id: string;
  key: string;
  name: string;
  source: ProjectAssetSource;
  category: ProjectAssetCategory;
  contentType: string;
  size: number;
  updatedAt: number;
  url: string;
  referenceText: string;
  path: string;
  version?: string;
  status?: ProjectAssetStatus;
  published?: boolean;
};

export type ProjectAssetVersionInfo = {
  currentVersion: string;
  publishedVersion: string;
  versionCount: number;
  updatedAt: number;
  nextVersion: string;
  hasUnpublishedChanges: boolean;
};

type AssetSnapshotEntry = {
  id: string;
  key: string;
  path: string;
  name: string;
  source: ProjectAssetSource;
  category: ProjectAssetCategory;
  contentType: string;
  size: number;
  updatedAt: number;
};

type ProjectAssetSnapshot = {
  version: string;
  createdAt: number;
  source: "generated" | "upload" | "chat_upload" | "delete" | "migrated" | "system";
  taskId?: string;
  files: AssetSnapshotEntry[];
};

type ProjectAssetManifest = {
  schemaVersion: 2;
  updatedAt: number;
  currentVersion: string;
  publishedVersion?: string;
  versions: ProjectAssetSnapshot[];
};

type UploadFileInput = {
  fileName: string;
  body: Uint8Array | Buffer | string;
  contentType?: string;
  relativePath?: string;
};

const ASSET_ROOT =
  String(process.env.PROJECT_ASSET_PREFIX || "project-assets")
    .trim()
    .replace(/^\/+|\/+$/g, "") || "project-assets";
const MANIFEST_RELATIVE_PATH = "_meta/manifest.v2.json";
const PREVIEW_ROOT_FOLDER = "preview";
const RELEASE_ROOT_FOLDER = "release/current/files";

function sanitizeToken(input: string) {
  const normalized = String(input || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized || "unknown";
}

function normalizeFileName(input: string) {
  const name =
    String(input || "")
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop() || "file";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).replace(/[^a-zA-Z0-9.]+/g, "") : "";
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safeBase = base || "file";
  return `${safeBase}${ext}`.slice(0, 160);
}

function normalizeRelativePath(input: string) {
  const cleaned = String(input || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const safe = cleaned
    .split("/")
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]+/g, "_"))
    .filter(Boolean)
    .join("/");
  return safe || "index.html";
}

function guessContentType(fileName: string): string {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".ts")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".tsx")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function classifyCategory(fileName: string): ProjectAssetCategory {
  const lower = String(fileName || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(lower)) return "image";
  if (/\.(html?|css|js|ts|tsx|json|xml|yaml|yml|md)$/.test(lower)) return "code";
  if (/\.(pdf|docx?|pptx?|xlsx?|txt|csv)$/.test(lower)) return "document";
  return "other";
}

function toAssetId(key: string) {
  return Buffer.from(String(key || ""), "utf8").toString("base64url");
}

export function fromAssetId(assetId: string): string {
  try {
    return Buffer.from(String(assetId || ""), "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function nowMs() {
  return Date.now();
}

function getProjectPrefix(ownerUserId: string, projectId: string) {
  return `${ASSET_ROOT}/${sanitizeToken(ownerUserId)}/${sanitizeToken(projectId)}/`;
}

function getManifestKey(prefix: string) {
  return `${prefix}${MANIFEST_RELATIVE_PATH}`;
}

function getPreviewObjectKey(prefix: string, version: string, relativePath: string) {
  return `${prefix}${PREVIEW_ROOT_FOLDER}/${version}/files/${normalizeRelativePath(relativePath)}`;
}

function getReleaseObjectKey(prefix: string, relativePath: string) {
  return `${prefix}${RELEASE_ROOT_FOLDER}/${normalizeRelativePath(relativePath)}`;
}

function buildFileProxyUrl(projectId: string, key: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/file?key=${encodeURIComponent(key)}`;
}

function parseVersion(value: string): { major: number; minor: number; patch: number } | undefined {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return undefined;
  return {
    major: Number(match[1]) || 0,
    minor: Number(match[2]) || 0,
    patch: Number(match[3]) || 0,
  };
}

function formatVersion(major: number, minor: number, patch: number) {
  return `${Math.max(0, major)}.${Math.max(0, minor)}.${Math.max(0, patch)}`;
}

function resolveNextVersion(currentVersion: string, versionCount: number): string {
  if (!currentVersion || versionCount <= 0) return "1.0.0";
  const parsed = parseVersion(currentVersion);
  if (!parsed) return "1.0.0";
  return formatVersion(parsed.major, parsed.minor, parsed.patch + 1);
}

function normalizeSource(raw: string): ProjectAssetSource {
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "generated") return "generated";
  if (normalized === "chat_upload" || normalized === "chat-upload" || normalized === "chat") return "chat_upload";
  return "upload";
}

function inferLegacySource(relativeKey: string): ProjectAssetSource {
  const first = String(relativeKey || "").split("/").filter(Boolean)[0] || "";
  if (first === "generated") return "generated";
  if (first === "chat-uploads") return "chat_upload";
  return "upload";
}

function isManagedRelativeKey(relativeKey: string): boolean {
  const normalized = String(relativeKey || "").replace(/^\/+/, "");
  return (
    normalized.startsWith("_meta/") ||
    normalized.startsWith("preview/") ||
    normalized.startsWith("release/")
  );
}

function toLegacyPath(relativeKey: string): string {
  const normalized = String(relativeKey || "").replace(/^\/+/, "");
  if (normalized.startsWith("generated/")) {
    const parts = normalized.split("/").slice(2);
    return normalizeRelativePath(parts.join("/") || "index.html");
  }
  if (normalized.startsWith("chat-uploads/")) {
    return normalizeRelativePath(`uploads/${normalized.slice("chat-uploads/".length)}`);
  }
  if (normalized.startsWith("uploads/")) {
    return normalizeRelativePath(normalized);
  }
  return normalizeRelativePath(normalized);
}

function buildSnapshotEntry(params: {
  key: string;
  relativePath: string;
  source: ProjectAssetSource;
  contentType?: string;
  size: number;
  updatedAt: number;
}): AssetSnapshotEntry {
  const normalizedPath = normalizeRelativePath(params.relativePath);
  const name = normalizeFileName(normalizedPath);
  const contentType = String(params.contentType || guessContentType(name)).trim() || "application/octet-stream";
  return {
    id: toAssetId(params.key),
    key: String(params.key || "").replace(/^\/+/, ""),
    path: normalizedPath,
    name,
    source: params.source,
    category: classifyCategory(name),
    contentType,
    size: Math.max(0, Number(params.size || 0)),
    updatedAt: Math.max(0, Number(params.updatedAt || nowMs())),
  };
}

function dedupeSnapshotFiles(files: AssetSnapshotEntry[]): AssetSnapshotEntry[] {
  const byPath = new Map<string, AssetSnapshotEntry>();
  for (const file of files || []) {
    const normalizedPath = normalizeRelativePath(file.path);
    const existing = byPath.get(normalizedPath);
    if (!existing || Number(file.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
      byPath.set(normalizedPath, {
        ...file,
        path: normalizedPath,
      });
    }
  }
  return Array.from(byPath.values());
}

function normalizeManifest(raw: any): ProjectAssetManifest | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const versionsRaw = Array.isArray(raw.versions) ? raw.versions : [];
  const versions: ProjectAssetSnapshot[] = versionsRaw
    .map((snapshot: any) => ({
      version: String(snapshot?.version || "").trim(),
      createdAt: Math.max(0, Number(snapshot?.createdAt || nowMs())),
      source: String(snapshot?.source || "system") as ProjectAssetSnapshot["source"],
      taskId: String(snapshot?.taskId || "").trim() || undefined,
      files: dedupeSnapshotFiles(
        Array.isArray(snapshot?.files)
          ? snapshot.files.map((file: any) => ({
              id: String(file?.id || toAssetId(String(file?.key || ""))),
              key: String(file?.key || "").replace(/^\/+/, ""),
              path: normalizeRelativePath(String(file?.path || "")),
              name: normalizeFileName(String(file?.name || file?.path || "")),
              source: normalizeSource(String(file?.source || "upload")),
              category: classifyCategory(String(file?.name || file?.path || "")),
              contentType: String(file?.contentType || guessContentType(String(file?.name || file?.path || ""))),
              size: Math.max(0, Number(file?.size || 0)),
              updatedAt: Math.max(0, Number(file?.updatedAt || snapshot?.createdAt || nowMs())),
            }))
          : [],
      ),
    }))
    .filter((snapshot: ProjectAssetSnapshot) => Boolean(snapshot.version));
  const currentVersion = String(raw.currentVersion || "").trim();
  const publishedVersion = String(raw.publishedVersion || "").trim() || undefined;
  const updatedAt = Math.max(0, Number(raw.updatedAt || nowMs()));
  return {
    schemaVersion: 2,
    updatedAt,
    currentVersion,
    ...(publishedVersion ? { publishedVersion } : {}),
    versions,
  };
}

async function tryGetObjectBytes(key: string): Promise<{
  body: Uint8Array;
  contentType?: string;
  contentLength?: number;
} | undefined> {
  try {
    const object = await getR2Client().getObject(key);
    if (!object || object.skipped || !object.ok || !("body" in object) || !object.body) return undefined;
    return {
      body: object.body,
      contentType: object.contentType || undefined,
      contentLength: object.contentLength || undefined,
    };
  } catch (error) {
    const message = String((error as any)?.message || error || "").toLowerCase();
    if (message.includes("404") || message.includes("not found")) return undefined;
    throw error;
  }
}

async function loadManifest(prefix: string): Promise<ProjectAssetManifest | undefined> {
  const manifestKey = getManifestKey(prefix);
  const object = await tryGetObjectBytes(manifestKey);
  if (!object?.body) return undefined;
  try {
    const raw = JSON.parse(Buffer.from(object.body).toString("utf8"));
    return normalizeManifest(raw);
  } catch {
    return undefined;
  }
}

async function saveManifest(prefix: string, manifest: ProjectAssetManifest) {
  const normalized: ProjectAssetManifest = {
    ...manifest,
    schemaVersion: 2,
    updatedAt: nowMs(),
    versions: manifest.versions.map((snapshot) => ({
      ...snapshot,
      files: dedupeSnapshotFiles(snapshot.files || []),
    })),
  };
  await getR2Client().putJson(getManifestKey(prefix), normalized);
}

function getSnapshot(manifest: ProjectAssetManifest, version: string): ProjectAssetSnapshot | undefined {
  const normalized = String(version || "").trim();
  if (!normalized) return undefined;
  return manifest.versions.find((snapshot) => snapshot.version === normalized);
}

function buildInitialEmptyManifest(): ProjectAssetManifest {
  return {
    schemaVersion: 2,
    updatedAt: nowMs(),
    currentVersion: "",
    versions: [],
  };
}

async function buildManifestFromLegacy(prefix: string): Promise<ProjectAssetManifest | undefined> {
  const objects = await getR2Client().listObjects(prefix, { maxKeys: 1000 });
  const legacyObjects = objects.filter((item) => {
    const relative = String(item.key || "").slice(prefix.length);
    if (!relative) return false;
    if (relative.endsWith("/")) return false;
    return !isManagedRelativeKey(relative);
  });
  if (legacyObjects.length === 0) return undefined;

  const byPath = new Map<string, AssetSnapshotEntry>();
  for (const object of legacyObjects) {
    const relativeKey = String(object.key || "").slice(prefix.length);
    const entry = buildSnapshotEntry({
      key: object.key,
      relativePath: toLegacyPath(relativeKey),
      source: inferLegacySource(relativeKey),
      size: Number(object.size || 0),
      updatedAt: object.lastModified ? Date.parse(object.lastModified) : nowMs(),
    });
    const prev = byPath.get(entry.path);
    if (!prev || entry.updatedAt >= prev.updatedAt) {
      byPath.set(entry.path, entry);
    }
  }
  const files = Array.from(byPath.values());
  if (files.length === 0) return undefined;

  return {
    schemaVersion: 2,
    updatedAt: nowMs(),
    currentVersion: "1.0.0",
    versions: [
      {
        version: "1.0.0",
        createdAt: nowMs(),
        source: "migrated",
        files,
      },
    ],
  };
}

async function loadOrInitManifest(prefix: string): Promise<ProjectAssetManifest> {
  const existing = await loadManifest(prefix);
  if (existing) return existing;

  const migrated = await buildManifestFromLegacy(prefix);
  const manifest = migrated || buildInitialEmptyManifest();
  await saveManifest(prefix, manifest);
  return manifest;
}

function ensureUniquePath(pathValue: string, used: Set<string>): string {
  const normalized = normalizeRelativePath(pathValue);
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  const ext = normalized.includes(".") ? `.${normalized.split(".").pop()}` : "";
  const base = ext ? normalized.slice(0, -ext.length) : normalized;
  let idx = 1;
  while (true) {
    const candidate = `${base}-${idx}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    idx += 1;
  }
}

function toAssetStatus(
  file: AssetSnapshotEntry,
  publishedMap: Map<string, string>,
): ProjectAssetStatus {
  if (publishedMap.size === 0) return "new";
  const publishedKey = publishedMap.get(file.path);
  if (!publishedKey) return "new";
  return publishedKey === file.key ? "published" : "modified";
}

function toAssetRecord(params: {
  projectId: string;
  currentVersion: string;
  file: AssetSnapshotEntry;
  publishedMap: Map<string, string>;
}): ProjectAssetRecord {
  const file = params.file;
  const status = toAssetStatus(file, params.publishedMap);
  const url = getR2Client().toPublicUrl(file.key) || buildFileProxyUrl(params.projectId, file.key);
  const referenceText = `Asset "${file.name}" path: ${file.path} (version ${params.currentVersion}) URL: ${url}`;
  return {
    id: file.id || toAssetId(file.key),
    key: file.key,
    name: file.name,
    source: file.source,
    category: file.category,
    contentType: file.contentType,
    size: file.size,
    updatedAt: file.updatedAt,
    url,
    referenceText,
    path: file.path,
    version: params.currentVersion,
    status,
    published: status === "published",
  };
}

function buildPublishedMap(snapshot?: ProjectAssetSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of snapshot?.files || []) {
    map.set(file.path, file.key);
  }
  return map;
}

function hasUnpublishedChanges(current?: ProjectAssetSnapshot, published?: ProjectAssetSnapshot): boolean {
  if (!current) return false;
  if (!published) return (current.files || []).length > 0;
  const currentMap = new Map((current.files || []).map((file) => [file.path, file.key]));
  const publishedMap = new Map((published.files || []).map((file) => [file.path, file.key]));
  if (currentMap.size !== publishedMap.size) return true;
  for (const [pathValue, key] of currentMap.entries()) {
    if (publishedMap.get(pathValue) !== key) return true;
  }
  return false;
}

async function prepareProjectState(params: { ownerUserId: string; projectId: string }) {
  const ownerUserId = String(params.ownerUserId || "").trim();
  const projectId = String(params.projectId || "").trim();
  if (!ownerUserId || !projectId) {
    throw new Error("Project asset operations require ownerUserId and projectId.");
  }
  const prefix = getProjectPrefix(ownerUserId, projectId);
  const manifest = await loadOrInitManifest(prefix);
  const currentSnapshot = getSnapshot(manifest, manifest.currentVersion);
  const publishedSnapshot = getSnapshot(manifest, String(manifest.publishedVersion || ""));
  return {
    ownerUserId,
    projectId,
    prefix,
    manifest,
    currentSnapshot,
    publishedSnapshot,
  };
}

function commitSnapshot(params: {
  manifest: ProjectAssetManifest;
  source: ProjectAssetSnapshot["source"];
  files: AssetSnapshotEntry[];
  taskId?: string;
}): { manifest: ProjectAssetManifest; version: string; snapshot: ProjectAssetSnapshot } {
  const version = resolveNextVersion(params.manifest.currentVersion, params.manifest.versions.length);
  const snapshot: ProjectAssetSnapshot = {
    version,
    createdAt: nowMs(),
    source: params.source,
    ...(params.taskId ? { taskId: params.taskId } : {}),
    files: dedupeSnapshotFiles(params.files || []),
  };
  const nextManifest: ProjectAssetManifest = {
    ...params.manifest,
    updatedAt: nowMs(),
    currentVersion: version,
    versions: [...params.manifest.versions.filter((item) => item.version !== version), snapshot],
  };
  return { manifest: nextManifest, version, snapshot };
}

export async function listProjectAssets(params: {
  ownerUserId: string;
  projectId: string;
}): Promise<ProjectAssetRecord[]> {
  const state = await prepareProjectState(params);
  const current = state.currentSnapshot;
  if (!current) return [];
  const publishedMap = buildPublishedMap(state.publishedSnapshot);
  return (current.files || [])
    .map((file) =>
      toAssetRecord({
        projectId: state.projectId,
        currentVersion: current.version,
        file,
        publishedMap,
      }),
    )
    .sort((a, b) => {
      const timeDiff = Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
      if (timeDiff !== 0) return timeDiff;
      return String(a.path || "").localeCompare(String(b.path || ""));
    });
}

export async function getProjectAssetVersionInfo(params: {
  ownerUserId: string;
  projectId: string;
}): Promise<ProjectAssetVersionInfo> {
  const state = await prepareProjectState(params);
  const current = state.currentSnapshot;
  const published = state.publishedSnapshot;
  return {
    currentVersion: String(state.manifest.currentVersion || ""),
    publishedVersion: String(state.manifest.publishedVersion || ""),
    versionCount: state.manifest.versions.length,
    updatedAt: Number(state.manifest.updatedAt || nowMs()),
    nextVersion: resolveNextVersion(
      String(state.manifest.currentVersion || ""),
      state.manifest.versions.length,
    ),
    hasUnpublishedChanges: hasUnpublishedChanges(current, published),
  };
}

export async function uploadProjectAssets(params: {
  ownerUserId: string;
  projectId: string;
  source?: ProjectAssetSource;
  files: UploadFileInput[];
}): Promise<{ uploaded: ProjectAssetRecord[]; version: string }> {
  const source = normalizeSource(params.source || "upload");
  const inputs = Array.isArray(params.files) ? params.files : [];
  if (inputs.length === 0) {
    throw new Error("uploadProjectAssets requires at least one file.");
  }

  const state = await prepareProjectState(params);
  const baseFiles = dedupeSnapshotFiles([...(state.currentSnapshot?.files || [])]);
  const nextVersion = resolveNextVersion(state.manifest.currentVersion, state.manifest.versions.length);
  const byPath = new Map(baseFiles.map((file) => [file.path, file]));
  const usedPaths = new Set(byPath.keys());
  const uploadedEntries: AssetSnapshotEntry[] = [];
  const r2 = getR2Client();

  for (const input of inputs) {
    const normalizedName = normalizeFileName(input.fileName);
    const rawPath =
      source === "generated"
        ? normalizeRelativePath(input.relativePath || normalizedName)
        : normalizeRelativePath(input.relativePath || `uploads/${normalizedName}`);
    const targetPath = source === "generated" ? rawPath : ensureUniquePath(rawPath, usedPaths);
    const payload =
      typeof input.body === "string"
        ? Buffer.from(input.body, "utf8")
        : input.body instanceof Uint8Array
          ? Buffer.from(input.body)
          : Buffer.from(input.body);
    const contentType =
      String(input.contentType || guessContentType(targetPath)).trim() || "application/octet-stream";
    const objectKey = getPreviewObjectKey(state.prefix, nextVersion, targetPath);

    await r2.putObject(objectKey, payload, { contentType });
    const entry = buildSnapshotEntry({
      key: objectKey,
      relativePath: targetPath,
      source,
      contentType,
      size: payload.byteLength,
      updatedAt: nowMs(),
    });
    byPath.set(entry.path, entry);
    uploadedEntries.push(entry);
  }

  const { manifest, version } = commitSnapshot({
    manifest: state.manifest,
    source,
    files: Array.from(byPath.values()),
  });
  await saveManifest(state.prefix, manifest);

  const publishedSnapshot = getSnapshot(manifest, String(manifest.publishedVersion || ""));
  const publishedMap = buildPublishedMap(publishedSnapshot);
  return {
    uploaded: uploadedEntries.map((file) =>
      toAssetRecord({
        projectId: state.projectId,
        currentVersion: version,
        file,
        publishedMap,
      }),
    ),
    version,
  };
}

export async function uploadProjectAsset(params: {
  ownerUserId: string;
  projectId: string;
  source?: ProjectAssetSource;
  fileName: string;
  body: Uint8Array | Buffer | string;
  contentType?: string;
  taskId?: string;
  generatedPath?: string;
}): Promise<ProjectAssetRecord> {
  const result = await uploadProjectAssets({
    ownerUserId: params.ownerUserId,
    projectId: params.projectId,
    source: params.source,
    files: [
      {
        fileName: params.fileName,
        body: params.body,
        contentType: params.contentType,
        relativePath: params.generatedPath,
      },
    ],
  });
  const first = result.uploaded[0];
  if (!first) {
    throw new Error("uploadProjectAsset failed to produce uploaded record.");
  }
  return first;
}

export async function deleteProjectAsset(params: {
  ownerUserId: string;
  projectId: string;
  key: string;
}) {
  const state = await prepareProjectState(params);
  const current = state.currentSnapshot;
  if (!current) {
    throw new Error("No current asset version exists.");
  }
  const normalizedKey = String(params.key || "").trim().replace(/^\/+/, "");
  if (!normalizedKey.startsWith(state.prefix)) {
    throw new Error("Asset key is outside project scope.");
  }
  const existing = (current.files || []).find((file) => file.key === normalizedKey);
  if (!existing) {
    throw new Error("Asset key not found in current version.");
  }

  const nextFiles = (current.files || []).filter((file) => file.key !== normalizedKey);
  const { manifest, version } = commitSnapshot({
    manifest: state.manifest,
    source: "delete",
    files: nextFiles,
  });
  await saveManifest(state.prefix, manifest);
  return {
    version,
    removedPath: existing.path,
  };
}

export async function getProjectAssetObject(params: {
  ownerUserId: string;
  projectId: string;
  key: string;
}) {
  const ownerUserId = String(params.ownerUserId || "").trim();
  const projectId = String(params.projectId || "").trim();
  const key = String(params.key || "").trim().replace(/^\/+/, "");
  if (!ownerUserId || !projectId || !key) {
    throw new Error("getProjectAssetObject requires ownerUserId, projectId and key.");
  }
  const prefix = getProjectPrefix(ownerUserId, projectId);
  if (!key.startsWith(prefix)) {
    throw new Error("Asset key is outside project scope.");
  }
  return getR2Client().getObject(key);
}

export async function syncGeneratedProjectAssetsFromSite(params: {
  ownerUserId?: string;
  projectId: string;
  taskId: string;
  siteDir?: string;
  generatedFiles?: string[];
}): Promise<{ uploaded: number; failed: number; version?: string }> {
  const ownerUserId = String(params.ownerUserId || "").trim();
  const projectId = String(params.projectId || "").trim();
  const taskId = String(params.taskId || "").trim();
  const siteDir = String(params.siteDir || "").trim();
  const generatedFiles = Array.isArray(params.generatedFiles) ? params.generatedFiles : [];
  if (!ownerUserId || !projectId || !taskId || !siteDir || generatedFiles.length === 0) {
    return { uploaded: 0, failed: 0 };
  }

  const state = await prepareProjectState({ ownerUserId, projectId });
  const siteRoot = path.resolve(siteDir);
  const nextVersion = resolveNextVersion(state.manifest.currentVersion, state.manifest.versions.length);
  const byPath = new Map<string, AssetSnapshotEntry>();
  for (const file of state.currentSnapshot?.files || []) {
    if (file.source !== "generated") {
      byPath.set(file.path, file);
    }
  }

  let uploaded = 0;
  let failed = 0;
  const r2 = getR2Client();
  for (const filePath of generatedFiles) {
    const relativePath = normalizeRelativePath(String(filePath || "").replace(/^\/+/, ""));
    if (!relativePath) continue;
    const absolutePath = path.resolve(siteRoot, relativePath);
    if (!absolutePath.startsWith(siteRoot)) {
      failed += 1;
      continue;
    }
    try {
      const content = await fs.readFile(absolutePath);
      const contentType = guessContentType(relativePath);
      const objectKey = getPreviewObjectKey(state.prefix, nextVersion, relativePath);
      await r2.putObject(objectKey, content, { contentType });
      byPath.set(
        relativePath,
        buildSnapshotEntry({
          key: objectKey,
          relativePath,
          source: "generated",
          contentType,
          size: content.byteLength,
          updatedAt: nowMs(),
        }),
      );
      uploaded += 1;
    } catch {
      failed += 1;
    }
  }

  if (uploaded <= 0) {
    return { uploaded, failed };
  }

  const { manifest, version } = commitSnapshot({
    manifest: state.manifest,
    source: "generated",
    taskId,
    files: Array.from(byPath.values()),
  });
  await saveManifest(state.prefix, manifest);
  return { uploaded, failed, version };
}

export async function publishCurrentProjectAssets(params: {
  ownerUserId: string;
  projectId: string;
}): Promise<{ publishedVersion: string; fileCount: number; copied: number; failed: number }> {
  const state = await prepareProjectState(params);
  const current = state.currentSnapshot;
  if (!current || !current.version) {
    return { publishedVersion: "", fileCount: 0, copied: 0, failed: 0 };
  }

  const r2 = getR2Client();
  const releasePrefix = `${state.prefix}release/current/`;
  const existingRelease = await r2.listObjects(releasePrefix, { maxKeys: 1000 });
  for (const object of existingRelease) {
    if (!object.key || object.key.endsWith("/")) continue;
    await r2.deleteObject(object.key).catch(() => {
      // best-effort cleanup
    });
  }

  let copied = 0;
  let failed = 0;
  for (const file of current.files || []) {
    try {
      const object = await tryGetObjectBytes(file.key);
      if (!object?.body) {
        failed += 1;
        continue;
      }
      const releaseKey = getReleaseObjectKey(state.prefix, file.path);
      await r2.putObject(releaseKey, Buffer.from(object.body), {
        contentType: file.contentType || object.contentType,
      });
      copied += 1;
    } catch {
      failed += 1;
    }
  }

  const manifest: ProjectAssetManifest = {
    ...state.manifest,
    updatedAt: nowMs(),
    publishedVersion: current.version,
  };
  await saveManifest(state.prefix, manifest);
  return {
    publishedVersion: current.version,
    fileCount: (current.files || []).length,
    copied,
    failed,
  };
}

export function summarizeAssetStats(assets: ProjectAssetRecord[]) {
  const safeAssets = Array.isArray(assets) ? assets : [];
  const totalBytes = safeAssets.reduce((sum, item) => sum + Math.max(0, Number(item.size || 0)), 0);
  return {
    totalFiles: safeAssets.length,
    totalBytes,
  };
}

export function filterAssets(
  assets: ProjectAssetRecord[],
  options: { query?: string; category?: "all" | ProjectAssetCategory },
) {
  const query = String(options.query || "").trim().toLowerCase();
  const category = String(options.category || "all").trim().toLowerCase();
  return assets.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!query) return true;
    const hay = `${item.name} ${item.path} ${item.key} ${item.source} ${item.status || ""}`.toLowerCase();
    return hay.includes(query);
  });
}

export function mapR2ListedObjectToAsset(
  projectId: string,
  ownerUserId: string,
  object: R2ListedObject,
): ProjectAssetRecord | undefined {
  const prefix = getProjectPrefix(ownerUserId, projectId);
  const normalizedKey = String(object.key || "");
  if (!normalizedKey.startsWith(prefix)) return undefined;
  const relativeKey = normalizedKey.slice(prefix.length);
  if (!relativeKey || relativeKey.endsWith("/")) return undefined;
  const pathValue = normalizeRelativePath(relativeKey);
  const source = inferLegacySource(relativeKey);
  const entry = buildSnapshotEntry({
    key: normalizedKey,
    relativePath: pathValue,
    source,
    size: Number(object.size || 0),
    updatedAt: object.lastModified ? Date.parse(object.lastModified) : nowMs(),
  });
  return {
    id: entry.id,
    key: entry.key,
    name: entry.name,
    source: entry.source,
    category: entry.category,
    contentType: entry.contentType,
    size: entry.size,
    updatedAt: entry.updatedAt,
    url: getR2Client().toPublicUrl(entry.key) || buildFileProxyUrl(projectId, entry.key),
    referenceText: `Asset "${entry.name}" path: ${entry.path} URL: ${
      getR2Client().toPublicUrl(entry.key) || buildFileProxyUrl(projectId, entry.key)
    }`,
    path: entry.path,
    status: "new",
    published: false,
  };
}
