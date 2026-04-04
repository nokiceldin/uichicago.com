import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import { getStudyWorkspacePayload } from "@/lib/study/server";
import { parseStoredPreferences, serializeStoredPreferences, type PlannerProfilePayload, type SiteSettingsPayload } from "@/lib/study/profile";
import { resolveAvatarUrl } from "@/lib/site-settings";
import { getSavedItemsForStudyUser } from "@/lib/saved-items";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const studyUser = await requireCurrentStudyUser();
    const [library, saved] = await Promise.all([
      getStudyWorkspacePayload(studyUser.id),
      getSavedItemsForStudyUser(studyUser.id),
    ]);
    const preferences = parseStoredPreferences(studyUser.studyPreferences);
    const unifiedSavedCourses = Array.from(
      new Set([
        ...(studyUser.currentCourses ?? []),
        ...(preferences.plannerProfile.currentCourses ?? []),
        ...(preferences.plannerProfile.completedCourses ?? []),
      ]),
    );
    const plannerProfile = {
      ...preferences.plannerProfile,
      currentCourses: unifiedSavedCourses,
      completedCourses: [],
    };

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
        currentCourses: unifiedSavedCourses,
        interests: studyUser.interests ?? [],
        studyPreferences: preferences.notes,
        plannerProfile,
        settings: preferences.settings,
      },
      library,
      saved,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/study/me]", error);
    return NextResponse.json({ error: "Failed to load study profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();
    const existingPreferences = parseStoredPreferences(studyUser.studyPreferences);
    const existingUnifiedCourses = Array.from(
      new Set([
        ...(studyUser.currentCourses ?? []),
        ...(existingPreferences.plannerProfile.currentCourses ?? []),
        ...(existingPreferences.plannerProfile.completedCourses ?? []),
      ]),
    );
    const normalizedTopLevelCurrentCourses = Array.isArray(body.currentCourses)
      ? body.currentCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
      : null;
    const normalizedPlannerCurrentCourses = Array.isArray(body.plannerProfile?.currentCourses)
      ? body.plannerProfile.currentCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
      : null;
    const unifiedCourseSource: string[] =
      normalizedTopLevelCurrentCourses
      ?? normalizedPlannerCurrentCourses
      ?? existingUnifiedCourses;
    const nextUnifiedCourses = Array.from(
      new Set(
        unifiedCourseSource
          .map((course: string) => String(course).trim())
          .filter(Boolean),
      ),
    );
    const nextStudyNotes =
      typeof body.studyPreferences === "string"
        ? body.studyPreferences.trim()
        : existingPreferences.notes;
    const nextPlannerProfile: PlannerProfilePayload = {
      majorSlug: String(body.plannerProfile?.majorSlug || existingPreferences.plannerProfile.majorSlug || "").trim() || undefined,
      currentSemesterNumber: Number.isFinite(Number(body.plannerProfile?.currentSemesterNumber))
        ? Number(body.plannerProfile.currentSemesterNumber)
        : existingPreferences.plannerProfile.currentSemesterNumber,
      honorsStudent:
        typeof body.plannerProfile?.honorsStudent === "boolean"
          ? body.plannerProfile.honorsStudent
          : Boolean(existingPreferences.plannerProfile.honorsStudent),
      currentCourses: normalizedPlannerCurrentCourses
        ?? normalizedTopLevelCurrentCourses
        ?? existingUnifiedCourses,
      completedCourses: [],
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
          school:
            typeof body.school === "string"
              ? String(body.school).trim() || "UIC"
              : studyUser.school ?? "UIC",
          major:
            typeof body.major === "string"
              ? String(body.major).trim() || null
              : studyUser.major,
          currentCourses: nextUnifiedCourses,
          interests: Array.isArray(body.interests)
            ? body.interests.map((interest: unknown) => String(interest).trim()).filter(Boolean)
            : studyUser.interests ?? [],
          studyPreferences: serializeStoredPreferences(nextStudyNotes, nextPlannerProfile, nextSettings),
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
        plannerProfile: {
          ...updatedPreferences.plannerProfile,
          currentCourses: updatedPreferences.plannerProfile.currentCourses ?? updated.currentCourses,
          completedCourses: [],
        },
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
    console.error("[PATCH /api/study/me]", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
