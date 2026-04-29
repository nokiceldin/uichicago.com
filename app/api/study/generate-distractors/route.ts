import { type NextRequest, NextResponse } from "next/server";
import { generateDistractors } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const questions: Array<{
      id: string;
      prompt: string;
      correctAnswer: string;
      topic: string;
      existingChoices?: string[];
    }> = body.questions ?? [];
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ distractors: [] });
    }
    // Cap at 30 questions per request to stay within token limits
    const batch = questions.slice(0, 30);
    const distractors = await generateDistractors(batch);
    return NextResponse.json({ distractors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate distractors." },
      { status: 400 },
    );
  }
}
