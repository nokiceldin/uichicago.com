import { NextRequest, NextResponse } from "next/server";
import { normalizeTranscript } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await normalizeTranscript({
      transcriptText: body.transcriptText || "",
      title: body.title,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process transcript." },
      { status: 400 },
    );
  }
}
