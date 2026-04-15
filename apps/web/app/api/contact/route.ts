import { NextRequest, NextResponse } from "next/server";
import { submitContactForm } from "@/lib/agent/db";

export const dynamic = "force-dynamic";

type IncomingPayload = {
  siteKey: string;
  data: Record<string, unknown>;
  shouldRedirect: boolean;
};

function extractClientIp(request: NextRequest) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return "";
  return xff.split(",")[0]?.trim() || "";
}

function formDataToObject(formData: FormData) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "_site_key" || key === "site_key") continue;
    if (typeof value === "string") data[key] = value;
  }
  return data;
}

async function parseIncomingPayload(request: NextRequest): Promise<IncomingPayload> {
  const contentType = request.headers.get("content-type") || "";
  const siteKeyFromQuery = request.nextUrl.searchParams.get("site_key") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    const siteKey =
      String(body.siteKey || body.site_key || siteKeyFromQuery || "").trim();
    const data = (body.data as Record<string, unknown>) || body;
    delete data.siteKey;
    delete data.site_key;

    return { siteKey, data, shouldRedirect: false };
  }

  const formData = await request.formData();
  const siteKey = String(
    formData.get("_site_key") || formData.get("site_key") || siteKeyFromQuery || "",
  ).trim();
  const data = formDataToObject(formData);
  return { siteKey, data, shouldRedirect: true };
}

function buildSuccessRedirect(request: NextRequest) {
  const referer = request.headers.get("referer") || "";
  try {
    const url = new URL(referer);
    url.searchParams.set("contact_submitted", "1");
    return url.toString();
  } catch {
    return `${request.nextUrl.origin}/?contact_submitted=1`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseIncomingPayload(request);
    if (!payload.siteKey) {
      return NextResponse.json({ ok: false, error: "Missing site_key." }, { status: 400 });
    }

    const meta = {
      ip: extractClientIp(request),
      user_agent: request.headers.get("user-agent") || "",
      origin: request.headers.get("origin") || "",
      referer: request.headers.get("referer") || "",
    };

    const result = await submitContactForm(payload.siteKey, payload.data, meta);

    if (payload.shouldRedirect) {
      return NextResponse.redirect(buildSuccessRedirect(request), 303);
    }

    return NextResponse.json({
      ok: true,
      submissionId: result.submissionId,
      projectId: (result as any).projectId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submit contact form failed.";
    const status = message === "Invalid site key." ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
