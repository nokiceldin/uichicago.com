import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import { getStudyWorkspacePayload } from "@/lib/study/server";
import { parseStoredPreferences, serializeStoredPreferences, type PlannerProfilePayload, type SiteSettingsPayload } from "@/lib/study/profile";
import { resolveAvatarUrl } from "@/lib/site-settings";

export async function GET() {
  try {
    const studyUser = await requireCurrentStudyUser();
    const library = await getStudyWorkspacePayload(studyUser.id);
    const preferences = parseStoredPreferences(studyUser.studyPreferences);

    return NextResponse.json({
      user: {
        id: studyUser.id,
        displayName: studyUser.displayName,
        email: studyUser.email,
        image: studyUser.image,
        avatarUrl: resolveAvatarUrl(preferences.settings.avatar, studyUser.image),
      },
      profile: {
        school: studyUser.school ?? "UIC",
        major: studyUser.major ?? "",
        currentCourses: studyUser.currentCourses ?? [],
        interests: studyUser.interests ?? [],
        studyPreferences: preferences.notes,
        plannerProfile: preferences.plannerProfile,
        settings: preferences.settings,
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
    const existingPreferences = parseStoredPreferences(studyUser.studyPreferences);
    const nextPlannerProfile: PlannerProfilePayload = {
      majorSlug: String(body.plannerProfile?.majorSlug || existingPreferences.plannerProfile.majorSlug || "").trim() || undefined,
      currentSemesterNumber: Number.isFinite(Number(body.plannerProfile?.currentSemesterNumber))
        ? Number(body.plannerProfile.currentSemesterNumber)
        : existingPreferences.plannerProfile.currentSemesterNumber,
      honorsStudent:
        typeof body.plannerProfile?.honorsStudent === "boolean"
          ? body.plannerProfile.honorsStudent
          : Boolean(existingPreferences.plannerProfile.honorsStudent),
      currentCourses: Array.isArray(body.plannerProfile?.currentCourses)
        ? body.plannerProfile.currentCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
        : existingPreferences.plannerProfile.currentCourses ?? [],
      completedCourses: Array.isArray(body.plannerProfile?.completedCourses)
        ? body.plannerProfile.completedCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
        : existingPreferences.plannerProfile.completedCourses ?? [],
    };
    const nextSettings: SiteSettingsPayload = {
      ...existingPreferences.settings,
      ...(typeof body.settings === "object" && body.settings ? body.settings : {}),
      themeSchedule: {
        ...existingPreferences.settings.themeSchedule,
        ...(typeof body.settings?.themeSchedule === "object" && body.settings?.themeSchedule ? body.settings.themeSchedule : {}),
      },
      avatar:
        typeof body.settings?.avatar === "object" && body.settings?.avatar
          ? body.settings.avatar
          : existingPreferences.settings.avatar,
    };

    const updated = await import("@/lib/prisma").then(({ default: prisma }) =>
      prisma.studyUser.update({
        where: { id: studyUser.id },
        data: {
          school: String(body.school || "UIC").trim() || "UIC",
          major:
            typeof body.major === "string"
              ? String(body.major).trim() || null
              : studyUser.major,
          currentCourses: Array.isArray(body.currentCourses)
            ? body.currentCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
            : studyUser.currentCourses ?? [],
          interests: Array.isArray(body.interests)
            ? body.interests.map((interest: unknown) => String(interest).trim()).filter(Boolean)
            : studyUser.interests ?? [],
          studyPreferences: serializeStoredPreferences(String(body.studyPreferences || "").trim(), nextPlannerProfile, nextSettings),
        },
      }),
    );

    const updatedPreferences = parseStoredPreferences(updated.studyPreferences);

    return NextResponse.json({
      ok: true,
      profile: {
        school: updated.school ?? "UIC",
        major: updated.major ?? "",
        currentCourses: updated.currentCourses,
        interests: updated.interests,
        studyPreferences: updatedPreferences.notes,
        plannerProfile: updatedPreferences.plannerProfile,
        settings: updatedPreferences.settings,
      },
      user: {
        image: updated.image,
        avatarUrl: resolveAvatarUrl(updatedPreferences.settings.avatar, updated.image),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
