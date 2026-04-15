import crypto from "node:crypto";

type PutObjectOptions = {
  contentType?: string;
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

  private buildSigningKey(dateStamp: string) {
    const kDate = hmacSha256(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, this.region);
    const kService = hmacSha256(kRegion, "s3");
    return hmacSha256(kService, "aws4_request");
  }

  async putObject(key: string, body: string | Buffer, options: PutObjectOptions = {}) {
    if (!this.isConfigured()) {
      return { ok: false, key, url: null as string | null, skipped: true };
    }

    const payload = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const method = "PUT";
    const encodedBucket = encodeURIComponent(this.bucket);
    const encodedKey = encodeUriPath(key);
    const canonicalUri = `/${encodedBucket}/${encodedKey}`;
    const canonicalQuery = "";
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

    const url = `https://${this.endpointHost}${canonicalUri}`;
    const requestBody = new Uint8Array(payload);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
      },
      body: requestBody,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`R2 putObject failed (${response.status}): ${text}`);
    }

    const publicUrl = this.publicBaseUrl ? `${this.publicBaseUrl}/${key}` : null;
    return { ok: true, key, url: publicUrl, skipped: false };
  }

  async putJson(key: string, value: unknown) {
    return this.putObject(key, JSON.stringify(value, null, 2), {
      contentType: "application/json; charset=utf-8",
    });
  }
}

const r2Client = new CloudflareR2Client();

export function getR2Client() {
  return r2Client;
}
