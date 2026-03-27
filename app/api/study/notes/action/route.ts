import { NextRequest, NextResponse } from "next/server";
import { runNoteAction } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await runNoteAction({
      action: body.action,
      content: body.content || "",
      course: body.course,
      subject: body.subject,
      title: body.title,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run note action." },
      { status: 400 },
    );
  }
}
