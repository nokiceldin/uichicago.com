import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getPostHogClient } from "@/app/lib/posthog-server";

export async function POST(req: Request) {
  const { message, rating } = await req.json();
  await prisma.feedback.create({ data: { message, rating } });
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "anonymous",
    event: "feedback_submitted",
    properties: { rating },
  });
  return NextResponse.json({ ok: true });
}