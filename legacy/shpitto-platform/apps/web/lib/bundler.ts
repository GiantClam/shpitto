import { createHash } from "node:crypto";

export interface BundleResult {
  manifest: Record<string, string>;
  fileEntries: Array<{
    path: string;
    hash: string;
    content: string;
    base64Content: string;
    type: string;
    size: number;
  }>;
}

type StaticFileInput = {
  path?: unknown;
  content?: unknown;
  type?: unknown;
};

export class Bundler {
  private static toSafeText(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private static normalizeBundlePath(raw: unknown): string {
    const text = this.toSafeText(raw).trim();
    if (!text) return "";
    const withSlash = text.startsWith("/") ? text : `/${text}`;
    return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  }

  private static inferMimeByPath(pathname: string): string {
    const lower = pathname.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
    if (lower.endsWith(".css")) return "text/css";
    if (lower.endsWith(".js")) return "application/javascript";
    if (lower.endsWith(".json")) return "application/json";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    return "text/plain";
  }

  private static normalizeStaticFiles(files: StaticFileInput[]): Array<{ path: string; content: string; type: string }> {
    const byPath = new Map<string, { path: string; content: string; type: string }>();
    for (const file of files) {
      const filePath = this.normalizeBundlePath(file?.path);
      if (!filePath) continue;
      const content = this.toSafeText(file?.content);
      const type = this.toSafeText(file?.type).trim() || this.inferMimeByPath(filePath);
      byPath.set(filePath, { path: filePath, content, type });
    }
    return Array.from(byPath.values());
  }

  private static buildBundleFromFiles(files: Array<{ path: string; content: string; type: string }>): BundleResult {
    const manifest: Record<string, string> = {};
    const fileEntries: BundleResult["fileEntries"] = [];

    for (const file of files) {
      const buffer = Buffer.from(file.content);
      const base64Content = buffer.toString("base64");
      const hash = createHash("md5").update(base64Content + file.path).digest("hex");
      manifest[file.path] = hash;
      fileEntries.push({
        path: file.path,
        hash,
        content: file.content,
        base64Content,
        type: file.type,
        size: buffer.length,
      });
    }

    return { manifest, fileEntries };
  }

  static async createBundle(config: any): Promise<BundleResult> {
    const mode = String(config?.staticSite?.mode || "");
    const filesRaw = Array.isArray(config?.staticSite?.files) ? config.staticSite.files : [];
    if (mode !== "skill-direct" || filesRaw.length === 0) {
      throw new Error("Bundler only supports skill-direct staticSite.files");
    }

    const files = this.normalizeStaticFiles(filesRaw);
    if (files.length === 0) {
      throw new Error("Bundler received empty static files after normalization");
    }

    return this.buildBundleFromFiles(files);
  }
}
