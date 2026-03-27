import { NextRequest, NextResponse } from "next/server";
import { generateExamFromSet } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await generateExamFromSet(body.set, body.desiredCount);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate exam." },
      { status: 400 },
    );
  }
}

