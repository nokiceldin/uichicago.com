import { NextRequest, NextResponse } from "next/server";
import { generateAnswerExplanation } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await generateAnswerExplanation({
      question: body.question || "",
      correctAnswer: body.correctAnswer || "",
      userAnswer: body.userAnswer || "",
      topic: body.topic,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to explain answer." },
      { status: 400 },
    );
  }
}

