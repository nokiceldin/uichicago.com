import { NextResponse } from "next/server";
import { generateDegreePlan } from "@/lib/study/degree-plan";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await generateDegreePlan({
      catalogCode: typeof body.catalogCode === "string" && /^\d{6}$/.test(body.catalogCode) ? body.catalogCode : undefined,
      major: String(body.major || "").trim(),
      majorSlug: String(body.majorSlug || "").trim() || undefined,
      currentSemesterNumber: Number.isFinite(Number(body.currentSemesterNumber))
        ? Number(body.currentSemesterNumber)
        : undefined,
      planLength: body.planLength,
      currentCourses: Array.isArray(body.currentCourses) ? body.currentCourses : [],
      completedCourses: Array.isArray(body.completedCourses) ? body.completedCourses : [],
      honorsStudent: Boolean(body.honorsStudent),
    });

    return NextResponse.json({ ok: true, plan: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not generate that degree plan.",
      },
      { status: 400 },
    );
  }
}
