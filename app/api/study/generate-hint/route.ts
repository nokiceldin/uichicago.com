import { NextRequest, NextResponse } from "next/server";
import { generateCardHint } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { front, back } = body as { front?: string; back?: string };

    if (!front || !back) {
      return NextResponse.json({ error: "front and back are required." }, { status: 400 });
    }

    const result = await generateCardHint({ front, back });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate hint." },
      { status: 500 },
    );
  }
}
