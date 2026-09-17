import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import { getStudyWorkspacePayload } from "@/lib/study/server";
import { parseStoredPreferences, serializeStoredPreferences, type PlannerProfilePayload, type SiteSettingsPayload, type StudyWorkspaceStatePayload } from "@/lib/study/profile";
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
    const currentCourses = preferences.plannerProfile.currentCourses ?? studyUser.currentCourses ?? [];
    const completedCourses = preferences.plannerProfile.completedCourses ?? [];
    const plannerProfile = {
      ...preferences.plannerProfile,
      currentCourses,
      completedCourses,
    };
    const noteFolders = preferences.workspaceState.noteFolders ?? {};
    const workspaceLibrary = {
      ...library,
      sets: library.sets.map((set) => ({
        ...set,
        ...(Object.prototype.hasOwnProperty.call(preferences.workspaceState, "savedSetIds")
          ? { saved: (preferences.workspaceState.savedSetIds ?? []).includes(set.id) }
          : {}),
      })),
      notes: library.notes.map((note) => ({ ...note, folder: noteFolders[note.id] ?? note.folder ?? "" })),
      progress: preferences.workspaceState.progress ?? {},
      quizResults: preferences.workspaceState.quizResults ?? [],
      noteAudioSessions: preferences.workspaceState.noteAudioSessions ?? [],
      noteAiLogs: preferences.workspaceState.noteAiLogs ?? [],
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
        currentCourses: studyUser.currentCourses ?? currentCourses,
        interests: studyUser.interests ?? [],
        studyPreferences: preferences.notes,
        plannerProfile,
        settings: preferences.settings,
      },
      library: workspaceLibrary,
      workspaceState: preferences.workspaceState,
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
    const existingCurrentCourses = existingPreferences.plannerProfile.currentCourses ?? studyUser.currentCourses ?? [];
    const existingCompletedCourses = existingPreferences.plannerProfile.completedCourses ?? [];
    const normalizedTopLevelCurrentCourses = Array.isArray(body.currentCourses)
      ? body.currentCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
      : null;
    const normalizedPlannerCurrentCourses = Array.isArray(body.plannerProfile?.currentCourses)
      ? body.plannerProfile.currentCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
      : null;
    const unifiedCourseSource: string[] =
      normalizedTopLevelCurrentCourses
      ?? normalizedPlannerCurrentCourses
      ?? existingCurrentCourses;
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
        ?? existingCurrentCourses,
      completedCourses: Array.isArray(body.plannerProfile?.completedCourses)
        ? body.plannerProfile.completedCourses.map((course: unknown) => String(course).trim()).filter(Boolean)
        : existingCompletedCourses,
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
    const requestedWorkspaceState =
      typeof body.workspaceState === "object" && body.workspaceState
        ? body.workspaceState as StudyWorkspaceStatePayload
        : null;
    const nextWorkspaceState: StudyWorkspaceStatePayload = requestedWorkspaceState
      ? {
          syncInitialized:
            typeof requestedWorkspaceState.syncInitialized === "boolean"
              ? requestedWorkspaceState.syncInitialized
              : existingPreferences.workspaceState.syncInitialized,
          progress:
            typeof requestedWorkspaceState.progress === "object" && requestedWorkspaceState.progress
              ? requestedWorkspaceState.progress
              : existingPreferences.workspaceState.progress,
          quizResults: Array.isArray(requestedWorkspaceState.quizResults)
            ? requestedWorkspaceState.quizResults.slice(0, 80)
            : existingPreferences.workspaceState.quizResults,
          customFolders: Array.isArray(requestedWorkspaceState.customFolders)
            ? requestedWorkspaceState.customFolders.map((folder) => String(folder).trim()).filter(Boolean).slice(0, 200)
            : existingPreferences.workspaceState.customFolders,
          noteFolders:
            typeof requestedWorkspaceState.noteFolders === "object" && requestedWorkspaceState.noteFolders
              ? Object.fromEntries(Object.entries(requestedWorkspaceState.noteFolders).slice(0, 1000).map(([id, folder]) => [id, String(folder).trim()]))
              : existingPreferences.workspaceState.noteFolders,
          matchBests:
            typeof requestedWorkspaceState.matchBests === "object" && requestedWorkspaceState.matchBests
              ? Object.fromEntries(Object.entries(requestedWorkspaceState.matchBests).slice(0, 500).filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0).map(([id, value]) => [id, Number(value)]))
              : existingPreferences.workspaceState.matchBests,
          savedSetIds: Array.isArray(requestedWorkspaceState.savedSetIds)
            ? requestedWorkspaceState.savedSetIds.map((id) => String(id)).filter(Boolean).slice(0, 1000)
            : existingPreferences.workspaceState.savedSetIds,
          noteAudioSessions: Array.isArray(requestedWorkspaceState.noteAudioSessions)
            ? requestedWorkspaceState.noteAudioSessions.slice(0, 200)
            : existingPreferences.workspaceState.noteAudioSessions,
          noteAiLogs: Array.isArray(requestedWorkspaceState.noteAiLogs)
            ? requestedWorkspaceState.noteAiLogs.slice(0, 200)
            : existingPreferences.workspaceState.noteAiLogs,
        }
      : existingPreferences.workspaceState;

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
          studyPreferences: serializeStoredPreferences(nextStudyNotes, nextPlannerProfile, nextSettings, nextWorkspaceState),
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
          completedCourses: updatedPreferences.plannerProfile.completedCourses ?? [],
        },
        settings: updatedPreferences.settings,
      },
      workspaceState: updatedPreferences.workspaceState,
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
