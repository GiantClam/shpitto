import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as signup } from "../../app/auth/signup/route";
import { POST as resendVerification } from "../../app/auth/email-verification/resend/route";
import { POST as confirmVerification } from "../../app/auth/email-verification/confirm/route";
import { POST as forgotPassword } from "../../app/auth/password/forgot/route";
import { POST as resetPassword } from "../../app/auth/password/reset/route";
import { POST as changePassword } from "../../app/auth/password/change/route";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createAuthUserWithVerification: vi.fn(),
  findAuthUserByEmail: vi.fn(),
  getAuthEmailRuntimeConfig: vi.fn(),
  sendEmailVerification: vi.fn(),
  consumeEmailVerificationToken: vi.fn(),
  sendPasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("../../lib/auth/cloudflare-email-auth", () => ({
  createAuthUserWithVerification: mocks.createAuthUserWithVerification,
  findAuthUserByEmail: mocks.findAuthUserByEmail,
  getAuthEmailRuntimeConfig: mocks.getAuthEmailRuntimeConfig,
  sendEmailVerification: mocks.sendEmailVerification,
  consumeEmailVerificationToken: mocks.consumeEmailVerificationToken,
  sendPasswordReset: mocks.sendPasswordReset,
  resetPasswordWithToken: mocks.resetPasswordWithToken,
}));

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "user-agent": "vitest",
      "cf-connecting-ip": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

describe("Cloudflare email auth routes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getAuthEmailRuntimeConfig.mockReturnValue({ supabase: {}, cloudflareEmail: {} });
  });

  it("creates a Supabase user through admin auth and sends Cloudflare verification email", async () => {
    mocks.createAuthUserWithVerification.mockResolvedValue({ userId: "user-1", email: "user@example.com" });

    const request = jsonRequest("/auth/signup", { email: "User@Example.com", password: "password123", next: "/chat" });
    const response = await signup(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.createAuthUserWithVerification).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
      request,
    });
  });

  it("resends verification through Cloudflare for unverified accounts", async () => {
    mocks.findAuthUserByEmail.mockResolvedValue({ userId: "user-1", email: "user@example.com", emailVerified: false });
    mocks.sendEmailVerification.mockResolvedValue({ verificationUrl: "http://localhost/verify-email?token=abc" });

    const response = await resendVerification(jsonRequest("/auth/email-verification/resend", { email: "user@example.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", email: "user@example.com" }),
    );
  });

  it("confirms email with an application token, not a Supabase token hash", async () => {
    mocks.consumeEmailVerificationToken.mockResolvedValue({ userId: "user-1", email: "user@example.com" });

    const response = await confirmVerification(jsonRequest("/auth/email-verification/confirm", { token: "plain-token" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.consumeEmailVerificationToken).toHaveBeenCalledWith("plain-token");
  });

  it("keeps forgot password response generic while sending Cloudflare reset email", async () => {
    mocks.findAuthUserByEmail.mockResolvedValue({ userId: "user-1", email: "user@example.com", emailVerified: true });
    mocks.sendPasswordReset.mockResolvedValue({ resetUrl: "http://localhost/reset-password?token=abc" });

    const response = await forgotPassword(jsonRequest("/auth/password/forgot", { email: "user@example.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      message: "If an account exists for this email, a password reset link has been sent.",
    });
    expect(mocks.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "user@example.com",
        requestedIp: "127.0.0.1",
        userAgent: "vitest",
      }),
    );
  });

  it("resets password with an application token", async () => {
    mocks.resetPasswordWithToken.mockResolvedValue({ userId: "user-1", email: "user@example.com" });

    const response = await resetPassword(jsonRequest("/auth/password/reset", { token: "reset-token", password: "newpass123" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.resetPasswordWithToken).toHaveBeenCalledWith("reset-token", "newpass123");
  });

  it("requires the current password before changing password", async () => {
    const signInWithPassword = vi.fn(async () => ({ error: null }));
    const updateUser = vi.fn(async () => ({ error: null }));
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1", email: "user@example.com" } }, error: null })),
        signInWithPassword,
        updateUser,
        signOut: vi.fn(async () => ({ error: null })),
      },
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const response = await changePassword(
      jsonRequest("/auth/password/change", { currentPassword: "oldpass123", newPassword: "newpass123" }),
    );

    expect(response.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "user@example.com", password: "oldpass123" });
    expect(updateUser).toHaveBeenCalledWith({ password: "newpass123" });
  });
});
