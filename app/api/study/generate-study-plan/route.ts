import { NextRequest, NextResponse } from "next/server";
import { generateStudyPlan } from "@/lib/study/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await generateStudyPlan({
      setTitle: body.setTitle || "Study set",
      weakAreas: Array.isArray(body.weakAreas) ? body.weakAreas : [],
      averageAccuracy: typeof body.averageAccuracy === "number" ? body.averageAccuracy : 0,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate study plan." },
      { status: 400 },
    );
  }
}
