import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import { getStudyWorkspacePayload } from "@/lib/study/server";

export async function GET() {
  try {
    const studyUser = await requireCurrentStudyUser();
    const library = await getStudyWorkspacePayload(studyUser.id);

    return NextResponse.json({
      user: {
        id: studyUser.id,
        displayName: studyUser.displayName,
        email: studyUser.email,
        image: studyUser.image,
      },
      profile: {
        school: studyUser.school ?? "UIC",
        major: studyUser.major ?? "",
        currentCourses: studyUser.currentCourses ?? [],
        interests: studyUser.interests ?? [],
        studyPreferences: studyUser.studyPreferences ?? "",
      },
      library,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load study profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();

    const updated = await import("@/lib/prisma").then(({ default: prisma }) =>
      prisma.studyUser.update({
        where: { id: studyUser.id },
        data: {
          school: String(body.school || "UIC").trim() || "UIC",
          major: String(body.major || "").trim() || null,
          currentCourses: Array.isArray(body.currentCourses)
            ? body.currentCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
            : [],
          interests: Array.isArray(body.interests)
            ? body.interests.map((interest: unknown) => String(interest).trim()).filter(Boolean)
            : [],
          studyPreferences: String(body.studyPreferences || "").trim() || null,
        },
      }),
    );

    return NextResponse.json({
      ok: true,
      profile: {
        school: updated.school ?? "UIC",
        major: updated.major ?? "",
        currentCourses: updated.currentCourses,
        interests: updated.interests,
        studyPreferences: updated.studyPreferences ?? "",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
