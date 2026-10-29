import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerMovedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "The chat worker now runs as a Railway persistent worker. This Vercel cron endpoint is disabled.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

export async function GET(req: Request) {
  void req;
  return workerMovedResponse();
}

export async function POST(req: Request) {
  void req;
  return workerMovedResponse();
}
