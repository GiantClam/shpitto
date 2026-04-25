import { NextRequest, NextResponse } from "next/server";
import { listContactSubmissionsByOwner, listContactSubmissionsByProject } from "@/lib/agent/db";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const limitParam = Number(request.nextUrl.searchParams.get("limit") || "100");
    const projectId = String(request.nextUrl.searchParams.get("projectId") || "").trim();
    const offsetParam = Number(request.nextUrl.searchParams.get("offset") || "0");
    const safeLimit = Number.isFinite(limitParam) ? limitParam : 100;
    const safeOffset = Number.isFinite(offsetParam) ? Math.max(0, Math.floor(offsetParam)) : 0;
    const rows = projectId
      ? await listContactSubmissionsByProject(user.id, projectId, safeLimit, safeOffset)
      : await listContactSubmissionsByOwner(user.id, safeLimit, safeOffset);

    return NextResponse.json({
      ok: true,
      items: rows.map((row) => ({
        ...row,
        submission: safeParseJson(row.submission_json),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "List submissions failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
