export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPostHogClient } from "@/app/lib/posthog-server";

export async function POST(req: NextRequest) {
  try {
    const { question, answer, rating } = await req.json();
    if (!question || !answer || !["good", "bad"].includes(rating)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Store as JSON in the existing 'message' column — no migration needed
    await prisma.feedback.create({
      data: {
        message: JSON.stringify({
          question: String(question).slice(0, 1000),
          answer: String(answer).slice(0, 3000),
        }),
        rating,
      },
    });

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: "anonymous",
      event: "chat_response_feedback",
      properties: { rating },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feedback POST]", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// Called by route.ts to load recent feedback patterns for the system prompt
export async function GET() {
  try {
    const rows = await prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { message: true, rating: true },
    });

    const parsed = rows.flatMap(r => {
      try {
        const { question, answer } = JSON.parse(r.message);
        return [{ question, answer, rating: r.rating }];
      } catch {
        return [];
      }
    });

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json([]);
  }
}
