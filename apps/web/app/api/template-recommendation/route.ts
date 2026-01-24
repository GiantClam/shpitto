import { NextResponse } from "next/server";
import { recommendTemplates } from "@/lib/templates/selector";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = body.prompt || "";
    const pageKind = body.pageKind || undefined;

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const recommendation = await recommendTemplates({ prompt, pageKind });

    return NextResponse.json(recommendation);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
