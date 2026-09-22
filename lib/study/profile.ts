import type { CardProgress, NoteAiGenerationLog, NoteAudioSession, QuizResult } from "@/lib/study/types";
import { selectedCurrentCoursesFromSavedImport, type SavedAuditImport } from "../academic/audit-import-review.ts";

export type PlannerProfilePayload = {
  auditImport?: SavedAuditImport;
  majorSlug?: string;
  currentSemesterNumber?: number;
  honorsStudent?: boolean;
  currentCourses?: string[];
  completedCourses?: string[];
};

export type StudyWorkspaceStatePayload = {
  syncInitialized?: boolean;
  progress?: Record<string, Record<string, CardProgress>>;
  quizResults?: QuizResult[];
  customFolders?: string[];
  noteFolders?: Record<string, string>;
  matchBests?: Record<string, number>;
  savedSetIds?: string[];
  noteAudioSessions?: NoteAudioSession[];
  noteAiLogs?: NoteAiGenerationLog[];
};

export type ThemeMode = "light" | "dark";

export type AvatarSelectionPayload =
  | {
      type?: "google";
    }
  | {
      type: "preset";
      value?: string;
    }
  | {
      type: "upload";
      value?: string;
    };

export type SiteSettingsPayload = {
  themeMode?: ThemeMode;
  avatar?: AvatarSelectionPayload;
};

export type StudyPreferencesEnvelope = {
  __type: "study_profile_v4";
  notes: string;
  plannerProfile: PlannerProfilePayload;
  settings: SiteSettingsPayload;
  workspaceState: StudyWorkspaceStatePayload;
};

export type StudyProfileSnapshot = {
  school: string;
  major: string;
  currentCourses: string[];
  interests: string[];
  studyPreferences: string;
  plannerProfile: PlannerProfilePayload;
  settings: SiteSettingsPayload;
};

export const STUDY_PROFILE_STORAGE_KEY = "uic-study-profile";

function studyProfileStorageKey(userId?: string | null) {
  return userId ? `${STUDY_PROFILE_STORAGE_KEY}:${encodeURIComponent(userId)}` : STUDY_PROFILE_STORAGE_KEY;
}

export function parseCommaSeparated(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseStoredPreferences(raw: string | null | undefined) {
  if (!raw) {
    return {
      notes: "",
      plannerProfile: {} as PlannerProfilePayload,
      settings: {} as SiteSettingsPayload,
      workspaceState: {} as StudyWorkspaceStatePayload,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StudyPreferencesEnvelope> & { __type?: string };
    if (parsed && (parsed.__type === "study_profile_v4" || parsed.__type === "study_profile_v3" || parsed.__type === "study_profile_v2")) {
      return {
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        plannerProfile: typeof parsed.plannerProfile === "object" && parsed.plannerProfile ? parsed.plannerProfile : {},
        settings: typeof parsed.settings === "object" && parsed.settings ? parsed.settings : {},
        workspaceState:
          typeof parsed.workspaceState === "object" && parsed.workspaceState
            ? parsed.workspaceState
            : {},
      };
    }
  } catch {}

  return {
    notes: raw,
    plannerProfile: {} as PlannerProfilePayload,
    settings: {} as SiteSettingsPayload,
    workspaceState: {} as StudyWorkspaceStatePayload,
  };
}

export function serializeStoredPreferences(
  notes: string,
  plannerProfile: PlannerProfilePayload,
  settings: SiteSettingsPayload = {},
  workspaceState: StudyWorkspaceStatePayload = {},
) {
  return JSON.stringify({
    __type: "study_profile_v4",
    notes,
    plannerProfile,
    settings,
    workspaceState,
  } satisfies StudyPreferencesEnvelope);
}

export function normalizeStudyProfileSnapshot(profile: Partial<StudyProfileSnapshot> | null | undefined): StudyProfileSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  const auditImport = profile.plannerProfile?.auditImport;
  const savedTopLevelCurrent = Array.isArray(profile.currentCourses)
    ? profile.currentCourses.map((course) => String(course).trim()).filter(Boolean)
    : [];
  const savedPlannerCurrent = Array.isArray(profile.plannerProfile?.currentCourses)
    ? profile.plannerProfile.currentCourses.map((course) => String(course).trim()).filter(Boolean)
    : [];
  // Repair profiles written by the earlier audit-import regression, which
  // could empty both current-course arrays while retaining reviewed IP rows.
  const recoveredAuditCurrent = savedTopLevelCurrent.length || savedPlannerCurrent.length
    ? []
    : selectedCurrentCoursesFromSavedImport(auditImport);
  const currentCourses = savedTopLevelCurrent.length
    ? savedTopLevelCurrent
    : savedPlannerCurrent.length
      ? savedPlannerCurrent
      : recoveredAuditCurrent;

  return {
    school: typeof profile.school === "string" && profile.school.trim() ? profile.school.trim() : "UIC",
    major: typeof profile.major === "string" ? profile.major.trim() : "",
    currentCourses,
    interests: Array.isArray(profile.interests)
      ? profile.interests.map((interest) => String(interest).trim()).filter(Boolean)
      : [],
    studyPreferences: typeof profile.studyPreferences === "string" ? profile.studyPreferences : "",
    plannerProfile: typeof profile.plannerProfile === "object" && profile.plannerProfile
      ? {
          auditImport,
          majorSlug:
            typeof profile.plannerProfile.majorSlug === "string" && profile.plannerProfile.majorSlug.trim()
              ? profile.plannerProfile.majorSlug.trim()
              : undefined,
          currentSemesterNumber:
            Number.isFinite(Number(profile.plannerProfile.currentSemesterNumber))
              ? Number(profile.plannerProfile.currentSemesterNumber)
              : undefined,
          honorsStudent: Boolean(profile.plannerProfile.honorsStudent),
          currentCourses: savedPlannerCurrent.length ? savedPlannerCurrent : currentCourses,
          completedCourses: Array.isArray(profile.plannerProfile.completedCourses)
            ? profile.plannerProfile.completedCourses.map((course) => String(course).trim()).filter(Boolean)
            : [],
        }
      : {},
    settings: typeof profile.settings === "object" && profile.settings ? profile.settings : {},
  };
}

export function readLocalStudyProfile(userId?: string | null) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(studyProfileStorageKey(userId));
    if (!raw) return null;
    return normalizeStudyProfileSnapshot(JSON.parse(raw) as Partial<StudyProfileSnapshot>);
  } catch {
    return null;
  }
}

export function writeLocalStudyProfile(profile: Partial<StudyProfileSnapshot> | null | undefined, userId?: string | null) {
  if (typeof window === "undefined") return;

  const normalized = normalizeStudyProfileSnapshot(profile);
  if (!normalized) return;

  window.localStorage.setItem(studyProfileStorageKey(userId), JSON.stringify(normalized));
}

export function clearLocalStudyProfile(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(studyProfileStorageKey(userId));
}
