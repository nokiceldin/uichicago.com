import { NextRequest, NextResponse } from "next/server";
import { generateFlashcardsFromText } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await generateFlashcardsFromText({
      sourceMaterial: body.sourceMaterial || "",
      course: body.course,
      topic: body.topic,
      desiredCount: body.desiredCount,
      difficultyTarget: body.difficultyTarget,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate flashcards." },
      { status: 400 },
    );
  }
}

