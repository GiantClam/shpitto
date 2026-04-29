import { NextResponse } from "next/server";

import { listDesignSystems } from "@/lib/design-system-registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const designSystems = await listDesignSystems();
    return NextResponse.json({ ok: true, designSystems });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list design systems.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
