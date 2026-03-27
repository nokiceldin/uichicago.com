import { NextRequest, NextResponse } from "next/server";
import { generateStructuredLectureNotes } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await generateStructuredLectureNotes({
      transcript: body.transcript || "",
      course: body.course,
      subject: body.subject,
      title: body.title,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate structured notes." },
      { status: 400 },
    );
  }
}
