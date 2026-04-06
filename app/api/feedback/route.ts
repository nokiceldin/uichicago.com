export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getPostHogClient } from "@/app/lib/posthog-server";

const FEEDBACK_LOG_DIR = path.join(process.cwd(), "artifacts", "feedback");
const BAD_RESPONSES_LOG_PATH = path.join(FEEDBACK_LOG_DIR, "bad-chat-responses.jsonl");
const WEBSITE_FEEDBACK_LOG_PATH = path.join(FEEDBACK_LOG_DIR, "website-feedback.jsonl");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, answer, rating, type } = body;

    if (type === "website") {
      const score = Number(body.score);
      const comment = String(body.comment ?? "").trim().slice(0, 3000);
      const page = String(body.page ?? "unknown").slice(0, 500);
      const timeOnSiteMs = Number(body.timeOnSiteMs ?? 0);
      const submittedAt = new Date().toISOString();

      if ((!Number.isInteger(score) || score < 1 || score > 5) && !comment) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      const message = JSON.stringify({
        type: "website",
        score: Number.isInteger(score) && score >= 1 && score <= 5 ? score : null,
        comment,
        page,
        timeOnSiteMs: Number.isFinite(timeOnSiteMs) ? Math.max(0, Math.round(timeOnSiteMs)) : 0,
        submittedAt,
      });

      await mkdir(FEEDBACK_LOG_DIR, { recursive: true });
      await appendFile(WEBSITE_FEEDBACK_LOG_PATH, `${message}\n`, "utf8");

      try {
        await prisma.feedback.create({
          data: {
            message,
            rating: "website",
          },
        });
      } catch (dbErr) {
        console.error("[feedback POST][website][db]", dbErr);
      }

      try {
        const posthog = getPostHogClient();
        posthog.capture({
          distinctId: "anonymous",
          event: "website_feedback_submitted",
          properties: {
            score: Number.isInteger(score) && score >= 1 && score <= 5 ? score : null,
            has_comment: !!comment,
            page,
          },
        });
      } catch (posthogErr) {
        console.error("[feedback POST][website][posthog]", posthogErr);
      }

      return NextResponse.json({ ok: true });
    }

    if (!question || !answer || !["good", "bad"].includes(rating)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const normalizedQuestion = String(question).slice(0, 1000);
    const normalizedAnswer = String(answer).slice(0, 3000);

    if (rating === "bad") {
      const logEntry = {
        createdAt: new Date().toISOString(),
        rating,
        question: normalizedQuestion,
        answer: normalizedAnswer,
      };

      await mkdir(FEEDBACK_LOG_DIR, { recursive: true });
      await appendFile(BAD_RESPONSES_LOG_PATH, `${JSON.stringify(logEntry)}\n`, "utf8");
    }

    // Keep the existing DB trail too, but do not fail the request if it errors.
    try {
      await prisma.feedback.create({
        data: {
          message: JSON.stringify({
            question: normalizedQuestion,
            answer: normalizedAnswer,
          }),
          rating,
        },
      });
    } catch (dbErr) {
      console.error("[feedback POST][db]", dbErr);
    }

    try {
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: "anonymous",
        event: "chat_response_feedback",
        properties: { rating },
      });
    } catch (posthogErr) {
      console.error("[feedback POST][posthog]", posthogErr);
    }

    return NextResponse.json({
      ok: true,
      loggedBadResponseToFile: rating === "bad",
      badResponsesLogPath: rating === "bad" ? BAD_RESPONSES_LOG_PATH : null,
    });
  } catch (err) {
    console.error("[feedback POST]", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// Called by route.ts to load recent feedback patterns for the system prompt
export async function GET() {
  try {
    const rows = await prisma.feedback.findMany({
      where: {
        rating: {
          in: ["good", "bad"],
        },
      },
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
