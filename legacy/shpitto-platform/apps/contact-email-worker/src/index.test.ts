import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

type StoredJob = {
  id: string;
  project_id: string;
  account_id: string;
  owner_user_id: string;
  submission_id: string | null;
  site_key: string | null;
  kind: string;
  to_email: string;
  subject: string;
  payload_json: string;
  status: string;
  retry_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type Env = {
  EMAIL_QUEUE_DB: D1Database;
  CLOUDFLARE_EMAIL_ACCOUNT_ID?: string;
  CLOUDFLARE_EMAIL_API_TOKEN?: string;
  CLOUDFLARE_EMAIL_FROM?: string;
  CONTACT_EMAIL_HEALTH_TOKEN?: string;
  CONTACT_EMAIL_BATCH_SIZE?: string;
  SHPITTO_CONTACT_EMAIL_MAX_RETRIES?: string;
};

const emailSendMock = vi.fn();
const jobs: StoredJob[] = [];

function nowIso() {
  return new Date().toISOString();
}

function buildEnv(overrides: Partial<Env> = {}): Env {
  const db: D1Database = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first<T>() {
              const text = String(sql || "");
              if (text.includes("FROM shpitto_outbound_emails") && text.includes("status IN ('queued', 'failed')")) {
                return (jobs.find((job) => (job.status === "queued" || job.status === "failed") && job.retry_count < 3) || null) as T;
              }
              if (text.includes("SELECT COUNT(*) AS count")) {
                const [, status] = params as [string, string];
                const count = jobs.filter((job) => job.status === status).length;
                return ({ count } as T) || null;
              }
              if (text.includes("SELECT retry_count FROM shpitto_outbound_emails")) {
                const [jobId] = params as [string];
                const job = jobs.find((item) => item.id === jobId);
                return (job ? ({ retry_count: job.retry_count } as T) : null) as T;
              }
              return null as T;
            },
            async run() {
              const text = String(sql || "");

              if (text.includes("SET status = 'sending'")) {
                const [updatedAt, jobId, retryCount] = params as [string, string, number];
                const job = jobs.find((item) => item.id === jobId);
                if (job && (job.status === "queued" || job.status === "failed") && job.retry_count === retryCount) {
                  job.status = "sending";
                  job.updated_at = updatedAt;
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }

              if (text.includes("SET status = 'sent'")) {
                const [sentAt, updatedAt, jobId] = params as [string, string, string];
                const job = jobs.find((item) => item.id === jobId);
                if (job) {
                  job.status = "sent";
                  job.sent_at = sentAt;
                  job.updated_at = updatedAt;
                  job.last_error = null;
                }
                return { success: true, meta: { changes: 1 } };
              }

              if (text.includes("SET status = ?")) {
                const [status, retryCount, lastError, updatedAt, jobId] = params as [string, number, string, string, string];
                const job = jobs.find((item) => item.id === jobId);
                if (job) {
                  job.status = status;
                  job.retry_count = retryCount;
                  job.last_error = lastError;
                  job.updated_at = updatedAt;
                }
                return { success: true, meta: { changes: 1 } };
              }

              return { success: true, meta: { changes: 0 } };
            },
          };
        },
      } as D1PreparedStatement;
    },
  } as D1Database;

  return {
    EMAIL_QUEUE_DB: db,
    CONTACT_EMAIL_BATCH_SIZE: "10",
    SHPITTO_CONTACT_EMAIL_MAX_RETRIES: "3",
    ...overrides,
  };
}

const ctx: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

describe("contact-email-worker", () => {
  beforeEach(() => {
    jobs.length = 0;
    emailSendMock.mockReset();
    vi.stubGlobal("fetch", emailSendMock);
  });

  it("returns health status", async () => {
    const response = await worker.fetch(new Request("https://worker.test/healthz"), buildEnv(), ctx);
    const payload = (await response.json()) as { ok: boolean; service: string; emailConfigured: boolean };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.service).toBe("contact-email-worker");
    expect(payload.emailConfigured).toBe(false);
  });

  it("rejects drain when the bearer token is missing", async () => {
    const env = buildEnv({ CONTACT_EMAIL_HEALTH_TOKEN: "secret-token" });
    const response = await worker.fetch(new Request("https://worker.test/drain", { method: "POST" }), env, ctx);
    const payload = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("unauthorized");
  });

  it("returns queue stats when authorized", async () => {
    jobs.push(
      {
        id: "job-queued",
        project_id: "project-1",
        account_id: "account-1",
        owner_user_id: "user-1",
        submission_id: "submission-1",
        site_key: "sp_demo",
        kind: "contact_owner_forward",
        to_email: "a@example.com",
        subject: "Subject",
        payload_json: JSON.stringify({ html: "<p>Hello</p>", text: "Hello" }),
        status: "queued",
        retry_count: 0,
        last_error: null,
        sent_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      {
        id: "job-failed",
        project_id: "project-1",
        account_id: "account-1",
        owner_user_id: "user-1",
        submission_id: "submission-2",
        site_key: "sp_demo",
        kind: "contact_owner_forward",
        to_email: "b@example.com",
        subject: "Subject",
        payload_json: JSON.stringify({ html: "<p>Hello</p>", text: "Hello" }),
        status: "failed",
        retry_count: 1,
        last_error: "oops",
        sent_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    );

    const env = buildEnv({ CONTACT_EMAIL_HEALTH_TOKEN: "secret-token" });
    const response = await worker.fetch(
      new Request("https://worker.test/stats", {
        headers: { Authorization: "Bearer secret-token" },
      }),
      env,
      ctx,
    );
    const payload = (await response.json()) as { ok: boolean; counts: Record<string, number> };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.counts.queued).toBe(1);
    expect(payload.counts.failed).toBe(1);
  });

  it("returns zero stats when the queue table does not exist yet", async () => {
    const originalEnv = buildEnv;
    const env = originalEnv({ CONTACT_EMAIL_HEALTH_TOKEN: "secret-token" });
    env.EMAIL_QUEUE_DB = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                throw new Error("D1_ERROR: no such table: shpitto_outbound_emails: SQLITE_ERROR");
              },
            };
          },
        } as D1PreparedStatement;
      },
    } as D1Database;

    const response = await worker.fetch(
      new Request("https://worker.test/stats", {
        headers: { Authorization: "Bearer secret-token" },
      }),
      env,
      ctx,
    );
    const payload = (await response.json()) as { ok: boolean; counts: Record<string, number> };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.counts.queued).toBe(0);
    expect(payload.counts.failed).toBe(0);
    expect(payload.counts.sent).toBe(0);
  });

  it("drains one queued job and marks it sent", async () => {
    jobs.push({
      id: "job-1",
      project_id: "project-1",
      account_id: "account-1",
      owner_user_id: "user-1",
      submission_id: "submission-1",
      site_key: "sp_demo",
      kind: "contact_owner_forward",
      to_email: "Official@Example.com",
      subject: "Subject",
      payload_json: JSON.stringify({
        html: "<p>Hello</p>",
        text: "Hello",
        replyTo: "Alice@Example.com",
      }),
      status: "queued",
      retry_count: 0,
      last_error: null,
      sent_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    emailSendMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
      status: 200,
    });

    const env = buildEnv({
      CLOUDFLARE_EMAIL_ACCOUNT_ID: "account-id",
      CLOUDFLARE_EMAIL_API_TOKEN: "api-token",
      CLOUDFLARE_EMAIL_FROM: "official@example.com",
    });

    const response = await worker.fetch(
      new Request("https://worker.test/drain", {
        method: "POST",
      }),
      env,
      ctx,
    );
    const payload = (await response.json()) as { ok: boolean; processed: number };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.processed).toBe(1);
    expect(jobs[0]?.status).toBe("sent");
    expect(emailSendMock).toHaveBeenCalledTimes(1);
    expect(emailSendMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/email/sending/send",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
