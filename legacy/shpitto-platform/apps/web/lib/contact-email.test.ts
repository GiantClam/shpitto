import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredJob = {
  id: string;
  project_id: string;
  account_id: string;
  owner_user_id: string;
  source_app: string;
  submission_id: string;
  site_key: string;
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

const jobs: StoredJob[] = [];

const mocks = vi.hoisted(() => ({
  getProjectContactSettingsState: vi.fn(),
  sendCloudflareEmail: vi.fn(),
}));

const fakeD1 = {
  isConfigured: () => true,
  ensureShpittoSchema: vi.fn(async () => {}),
  query: vi.fn(async () => []),
  queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql || "");
    if (text.includes("FROM shpitto_outbound_emails") && text.includes("status IN ('queued', 'failed')")) {
      return jobs.find((job) => (job.status === "queued" || job.status === "failed") && job.retry_count < 3) || null;
    }
    if (text.includes("SELECT retry_count FROM shpitto_outbound_emails")) {
      const [jobId] = params as string[];
      const job = jobs.find((item) => item.id === jobId);
      return job ? { retry_count: job.retry_count } : null;
    }
    return null;
  }),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql || "");

    if (text.includes("INSERT INTO shpitto_outbound_emails")) {
      const [
        id,
        projectId,
        accountId,
        ownerUserId,
        sourceApp,
        submissionId,
        siteKey,
        kind,
        toEmail,
        subject,
        payloadJson,
        createdAt,
        updatedAt,
      ] = params as string[];

      jobs.push({
        id,
        project_id: projectId,
        account_id: accountId,
        owner_user_id: ownerUserId,
        source_app: sourceApp,
        submission_id: submissionId,
        site_key: siteKey,
        kind,
        to_email: toEmail,
        subject,
        payload_json: payloadJson,
        status: "queued",
        retry_count: 0,
        last_error: null,
        sent_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { success: true };
    }

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
      const [sentAt, updatedAt, jobId] = params as string[];
      const job = jobs.find((item) => item.id === jobId);
      if (job) {
        job.status = "sent";
        job.sent_at = sentAt;
        job.updated_at = updatedAt;
        job.last_error = null;
      }
      return { success: true };
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
      return { success: true };
    }

    return { success: true };
  }),
};

vi.mock("./d1", () => ({
  getD1Client: () => fakeD1,
}));

vi.mock("./project-settings", () => ({
  getProjectContactSettingsState: mocks.getProjectContactSettingsState,
}));

vi.mock("./auth/cloudflare-email-auth", () => ({
  normalizeAuthEmail: (value: string) => value.trim().toLowerCase(),
  sendCloudflareEmail: mocks.sendCloudflareEmail,
}));

describe("contact email jobs", () => {
  beforeEach(() => {
    jobs.length = 0;
    fakeD1.ensureShpittoSchema.mockClear();
    fakeD1.query.mockClear();
    fakeD1.queryOne.mockClear();
    fakeD1.execute.mockClear();
    mocks.getProjectContactSettingsState.mockReset();
    mocks.sendCloudflareEmail.mockReset();
    delete process.env.SHPITTO_CONTACT_FORWARD_TO;
    delete process.env.SHPITTO_CONTACT_ACK_ENABLED;
  });

  it("uses project settings for forward recipients and user ack", async () => {
    mocks.getProjectContactSettingsState.mockResolvedValue({
      settings: {
        forwardTo: ["official@example.com", "ops@example.com"],
        sendUserAck: true,
        replyToField: "email",
        brandName: "CASUX",
      },
      hasStoredSettings: true,
      hasStoredForwardTo: true,
      hasStoredSendUserAck: true,
    });

    const { queueContactEmailJobs } = await import("./contact-email");
    const createdJobs = await queueContactEmailJobs({
      projectId: "project-1",
      accountId: "account-1",
      ownerUserId: "user-1",
      siteKey: "sp_demo",
      submissionId: "submission-1",
      submissionData: {
        name: "Alice",
        email: "Alice@Example.com",
        message: "Need help",
      },
    });

    expect(createdJobs.map((job) => job.kind)).toEqual([
      "contact_user_ack",
      "contact_owner_forward",
      "contact_owner_forward",
    ]);
    expect(jobs.map((job) => job.to_email)).toEqual([
      "alice@example.com",
      "official@example.com",
      "ops@example.com",
    ]);

    const forwardPayload = JSON.parse(jobs[1]!.payload_json) as { replyTo?: string };
    expect(forwardPayload.replyTo).toBe("alice@example.com");
  });

  it("falls back to env forwarding when project settings do not store a mailbox", async () => {
    process.env.SHPITTO_CONTACT_FORWARD_TO = "sales@example.com, ops@example.com";
    process.env.SHPITTO_CONTACT_ACK_ENABLED = "false";
    mocks.getProjectContactSettingsState.mockResolvedValue({
      settings: {
        forwardTo: [],
        sendUserAck: true,
        replyToField: "email",
        brandName: "CASUX",
      },
      hasStoredSettings: true,
      hasStoredForwardTo: false,
      hasStoredSendUserAck: false,
    });

    const { queueContactEmailJobs } = await import("./contact-email");
    const createdJobs = await queueContactEmailJobs({
      projectId: "project-1",
      accountId: "account-1",
      ownerUserId: "user-1",
      siteKey: "sp_demo",
      submissionId: "submission-1",
      submissionData: {
        name: "Alice",
        email: "alice@example.com",
      },
    });

    expect(createdJobs).toHaveLength(2);
    expect(createdJobs.every((job) => job.kind === "contact_owner_forward")).toBe(true);
    expect(jobs.map((job) => job.to_email)).toEqual(["sales@example.com", "ops@example.com"]);
  });

  it("skips the user ack when there is no contact email", async () => {
    mocks.getProjectContactSettingsState.mockResolvedValue({
      settings: {
        forwardTo: ["official@example.com"],
        sendUserAck: true,
        replyToField: "email",
        brandName: "CASUX",
      },
      hasStoredSettings: true,
      hasStoredForwardTo: true,
      hasStoredSendUserAck: true,
    });

    const { queueContactEmailJobs } = await import("./contact-email");
    const createdJobs = await queueContactEmailJobs({
      projectId: "project-1",
      accountId: "account-1",
      ownerUserId: "user-1",
      siteKey: "sp_demo",
      submissionId: "submission-1",
      submissionData: {
        name: "Anonymous",
        message: "No email on this form",
      },
    });

    expect(createdJobs).toHaveLength(1);
    expect(createdJobs[0]?.kind).toBe("contact_owner_forward");
    expect(jobs).toHaveLength(1);
  });

  it("marks failed jobs as dead after the retry limit", async () => {
    jobs.push({
      id: "job-1",
      project_id: "project-1",
      account_id: "account-1",
      owner_user_id: "user-1",
      source_app: "shpitto",
      submission_id: "submission-1",
      site_key: "sp_demo",
      kind: "contact_owner_forward",
      to_email: "official@example.com",
      subject: "Subject",
      payload_json: JSON.stringify({ html: "<p>x</p>", text: "x" }),
      status: "failed",
      retry_count: 2,
      last_error: "previous",
      sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { markOutboundEmailJobFailed } = await import("./contact-email");
    await markOutboundEmailJobFailed("job-1", new Error("still failing"));

    expect(jobs[0]?.status).toBe("dead");
    expect(jobs[0]?.retry_count).toBe(3);
    expect(jobs[0]?.last_error).toContain("still failing");
  });

  it("skips a stale claim when another worker already moved the job", async () => {
    jobs.push({
      id: "job-claim-race",
      project_id: "project-1",
      account_id: "account-1",
      owner_user_id: "user-1",
      source_app: "shpitto",
      submission_id: "submission-1",
      site_key: "sp_demo",
      kind: "contact_owner_forward",
      to_email: "official@example.com",
      subject: "Subject",
      payload_json: JSON.stringify({ html: "<p>x</p>", text: "x" }),
      status: "queued",
      retry_count: 0,
      last_error: null,
      sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const originalExecute = fakeD1.execute.getMockImplementation();
    let intercepted = false;
    fakeD1.execute.mockImplementationOnce(async (sql: string, params: unknown[] = []) => {
      const text = String(sql || "");
      if (!intercepted && text.includes("SET status = 'sending'")) {
        intercepted = true;
        const [updatedAt, jobId] = params as [string, string];
        const job = jobs.find((item) => item.id === jobId);
        if (job) {
          job.status = "sent";
          job.updated_at = updatedAt;
        }
        return { success: true, meta: { changes: 0 } };
      }
      return originalExecute ? originalExecute(sql, params) : { success: true };
    });

    const { claimNextOutboundEmailJob } = await import("./contact-email");
    const claimed = await claimNextOutboundEmailJob();

    expect(claimed).toBeNull();
    expect(jobs[0]?.status).toBe("sent");
  });

  it("passes reply-to through when delivering a queued forward email", async () => {
    mocks.sendCloudflareEmail.mockResolvedValue({ success: true });

    const { deliverOutboundEmailJob } = await import("./contact-email");
    await deliverOutboundEmailJob({
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(mocks.sendCloudflareEmail).toHaveBeenCalledWith({
      to: "official@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
      replyTo: "alice@example.com",
    });
  });
});
