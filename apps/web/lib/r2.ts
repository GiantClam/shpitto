import crypto from "node:crypto";

type PutObjectOptions = {
  contentType?: string;
  cacheControl?: string;
};

export type R2ListedObject = {
  key: string;
  size: number;
  etag?: string;
  lastModified?: string;
};

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(payload: string | Buffer) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function hexHmacSha256(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

function encodeUriPath(pathPart: string) {
  return pathPart
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodeQueryPart(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalQuery(query: Record<string, string>) {
  return Object.keys(query)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${encodeQueryPart(key)}=${encodeQueryPart(String(query[key] || ""))}`)
    .join("&");
}

function decodeXmlText(value: string): string {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function pickXmlTag(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return String(match?.[1] || "").trim();
}

function parseListBucketXml(xml: string): {
  objects: R2ListedObject[];
  isTruncated: boolean;
  nextContinuationToken?: string;
} {
  const objects: R2ListedObject[] = [];
  const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  for (const block of contents) {
    const key = decodeXmlText(pickXmlTag(block, "Key"));
    if (!key) continue;
    const sizeText = pickXmlTag(block, "Size");
    const etag = decodeXmlText(pickXmlTag(block, "ETag")).replace(/^"+|"+$/g, "");
    const lastModified = decodeXmlText(pickXmlTag(block, "LastModified"));
    objects.push({
      key,
      size: Number(sizeText || "0") || 0,
      etag: etag || undefined,
      lastModified: lastModified || undefined,
    });
  }
  const isTruncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const nextContinuationToken = decodeXmlText(pickXmlTag(xml, "NextContinuationToken")) || undefined;
  return { objects, isTruncated, nextContinuationToken };
}

function normalizeEndpoint(endpoint: string) {
  const stripped = endpoint.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!stripped) return "";
  return stripped;
}

export class CloudflareR2Client {
  private readonly accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "";
  private readonly bucket = process.env.R2_BUCKET || "";
  private readonly accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || "";
  private readonly secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET || "";
  private readonly region = process.env.R2_REGION || "auto";
  private readonly endpointHost = normalizeEndpoint(
    process.env.R2_ENDPOINT || `${process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || ""}.r2.cloudflarestorage.com`,
  );
  private readonly publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

  isConfigured() {
    return Boolean(
      this.accountId &&
        this.bucket &&
        this.accessKeyId &&
        this.secretAccessKey &&
        this.endpointHost,
    );
  }

  toPublicUrl(key: string) {
    if (!this.publicBaseUrl) return undefined;
    const normalized = String(key || "").replace(/^\/+/, "");
    if (!normalized) return undefined;
    return `${this.publicBaseUrl}/${normalized}`;
  }

  private buildSigningKey(dateStamp: string) {
    const kDate = hmacSha256(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, this.region);
    const kService = hmacSha256(kRegion, "s3");
    return hmacSha256(kService, "aws4_request");
  }

  private async signedRequest(params: {
    method: "GET" | "PUT" | "DELETE";
    key?: string;
    query?: Record<string, string>;
    body?: string | Buffer | Uint8Array;
    headers?: Record<string, string>;
  }) {
    if (!this.isConfigured()) {
      return {
        response: null as Response | null,
        skipped: true,
      };
    }

    const payload =
      typeof params.body === "string"
        ? Buffer.from(params.body, "utf8")
        : params.body instanceof Uint8Array
          ? Buffer.from(params.body)
          : params.body || Buffer.alloc(0);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const method = params.method;
    const encodedBucket = encodeURIComponent(this.bucket);
    const encodedKey = params.key ? `/${encodeUriPath(params.key.replace(/^\/+/, ""))}` : "";
    const canonicalUri = `/${encodedBucket}${encodedKey}`;
    const canonicalQuery = params.query ? buildCanonicalQuery(params.query) : "";
    const payloadHash = sha256Hex(payload);

    const canonicalHeaders =
      `host:${this.endpointHost}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = this.buildSigningKey(dateStamp);
    const signature = hexHmacSha256(signingKey, stringToSign);

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url = `https://${this.endpointHost}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
    const requestBody = new Uint8Array(payload);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        ...(params.headers || {}),
      },
      body: method === "PUT" ? requestBody : undefined,
    });

    return {
      response,
      skipped: false,
    };
  }

  async putObject(key: string, body: string | Buffer, options: PutObjectOptions = {}) {
    if (!this.isConfigured()) {
      return { ok: false, key, url: null as string | null, skipped: true };
    }

    const { response } = await this.signedRequest({
      method: "PUT",
      key,
      body,
      headers: {
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
        ...(options.cacheControl ? { "Cache-Control": options.cacheControl } : {}),
      },
    });

    if (!response) {
      return { ok: false, key, url: null as string | null, skipped: true };
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`R2 putObject failed (${response.status}): ${text}`);
    }

    const publicUrl = this.toPublicUrl(key) || null;
    return { ok: true, key, url: publicUrl, skipped: false };
  }

  async putJson(key: string, value: unknown) {
    return this.putObject(key, JSON.stringify(value, null, 2), {
      contentType: "application/json; charset=utf-8",
    });
  }

  async deleteObject(key: string) {
    const normalizedKey = String(key || "").replace(/^\/+/, "");
    if (!normalizedKey) throw new Error("R2 deleteObject requires a key.");
    const { response, skipped } = await this.signedRequest({
      method: "DELETE",
      key: normalizedKey,
    });
    if (skipped || !response) return { ok: false, skipped: true };
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`R2 deleteObject failed (${response.status}): ${text}`);
    }
    return { ok: true, skipped: false };
  }

  async getObject(key: string) {
    const normalizedKey = String(key || "").replace(/^\/+/, "");
    if (!normalizedKey) throw new Error("R2 getObject requires a key.");
    const { response, skipped } = await this.signedRequest({
      method: "GET",
      key: normalizedKey,
    });
    if (skipped || !response) return { ok: false, skipped: true } as const;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`R2 getObject failed (${response.status}): ${text}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      ok: true as const,
      skipped: false,
      key: normalizedKey,
      body: bytes,
      contentType: response.headers.get("content-type"),
      contentLength: Number(response.headers.get("content-length") || "0") || undefined,
      etag: response.headers.get("etag") || undefined,
      lastModified: response.headers.get("last-modified") || undefined,
    };
  }

  async listObjects(prefix: string, options: { maxKeys?: number } = {}): Promise<R2ListedObject[]> {
    const normalizedPrefix = String(prefix || "").replace(/^\/+/, "");
    const maxKeys = Math.max(1, Math.min(1000, Number(options.maxKeys || 500)));
    if (!this.isConfigured()) return [];

    const objects: R2ListedObject[] = [];
    let continuationToken = "";
    for (;;) {
      const query: Record<string, string> = {
        "list-type": "2",
        "max-keys": String(maxKeys),
      };
      if (normalizedPrefix) query.prefix = normalizedPrefix;
      if (continuationToken) query["continuation-token"] = continuationToken;

      const { response } = await this.signedRequest({
        method: "GET",
        query,
      });
      if (!response) return objects;
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`R2 listObjects failed (${response.status}): ${text}`);
      }
      const xml = await response.text();
      const parsed = parseListBucketXml(xml);
      objects.push(...parsed.objects);
      if (!parsed.isTruncated || !parsed.nextContinuationToken) break;
      continuationToken = parsed.nextContinuationToken;
    }

    return objects;
  }
}

const r2Client = new CloudflareR2Client();

export function getR2Client() {
  return r2Client;
}
