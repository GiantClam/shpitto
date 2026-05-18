import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/contact/route";

const mocks = vi.hoisted(() => ({
  submitContactForm: vi.fn(),
  queueContactEmailJobs: vi.fn(),
}));

vi.mock("@/lib/agent/db", () => ({
  submitContactForm: mocks.submitContactForm,
}));

vi.mock("@/lib/contact-email", () => ({
  queueContactEmailJobs: mocks.queueContactEmailJobs,
}));

describe("contact route", () => {
  beforeEach(() => {
    mocks.submitContactForm.mockReset();
    mocks.queueContactEmailJobs.mockReset();
  });

  it("returns 400 when site key is missing", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { email: "user@example.com" } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(mocks.submitContactForm).not.toHaveBeenCalled();
  });

  it("queues contact email jobs after saving a submission", async () => {
    mocks.submitContactForm.mockResolvedValue({
      submissionId: "submission-1",
      projectId: "project-1",
      accountId: "account-1",
      ownerUserId: "user-1",
    });
    mocks.queueContactEmailJobs.mockResolvedValue([]);

    const response = await POST(
      new NextRequest("http://localhost/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "user-agent": "vitest",
          origin: "http://example.com",
          referer: "http://example.com/contact",
          "cf-connecting-ip": "127.0.0.1",
        },
        body: JSON.stringify({
          siteKey: "sp_demo",
          data: {
            email: "user@example.com",
            name: "User Example",
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.submitContactForm).toHaveBeenCalled();
    expect(mocks.queueContactEmailJobs).toHaveBeenCalledWith({
      projectId: "project-1",
      accountId: "account-1",
      ownerUserId: "user-1",
      siteKey: "sp_demo",
      submissionId: "submission-1",
      submissionData: {
        email: "user@example.com",
        name: "User Example",
      },
    });
  });

  it("does not fail the request when queueing email jobs fails", async () => {
    mocks.submitContactForm.mockResolvedValue({
      submissionId: "submission-1",
      projectId: "project-1",
      accountId: "account-1",
      ownerUserId: "user-1",
    });
    mocks.queueContactEmailJobs.mockRejectedValue(new Error("queue failed"));

    const response = await POST(
      new NextRequest("http://localhost/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey: "sp_demo",
          data: { email: "user@example.com" },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
