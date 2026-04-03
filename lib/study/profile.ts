export type PlannerProfilePayload = {
  majorSlug?: string;
  currentSemesterNumber?: number;
  honorsStudent?: boolean;
  currentCourses?: string[];
  completedCourses?: string[];
};

export type ThemeMode = "auto" | "light" | "dark";

export type ThemeSchedulePayload = {
  darkStartHour?: number;
  lightStartHour?: number;
};

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
  themeSchedule?: ThemeSchedulePayload;
  avatar?: AvatarSelectionPayload;
};

export type StudyPreferencesEnvelope = {
  __type: "study_profile_v3";
  notes: string;
  plannerProfile: PlannerProfilePayload;
  settings: SiteSettingsPayload;
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
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StudyPreferencesEnvelope>;
    if (parsed && (parsed.__type === "study_profile_v3" || parsed.__type === "study_profile_v2")) {
      return {
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        plannerProfile: typeof parsed.plannerProfile === "object" && parsed.plannerProfile ? parsed.plannerProfile : {},
        settings: typeof parsed.settings === "object" && parsed.settings ? parsed.settings : {},
      };
    }
  } catch {}

  return {
    notes: raw,
    plannerProfile: {} as PlannerProfilePayload,
    settings: {} as SiteSettingsPayload,
  };
}

export function serializeStoredPreferences(
  notes: string,
  plannerProfile: PlannerProfilePayload,
  settings: SiteSettingsPayload = {},
) {
  return JSON.stringify({
    __type: "study_profile_v3",
    notes,
    plannerProfile,
    settings,
  } satisfies StudyPreferencesEnvelope);
}

export function normalizeStudyProfileSnapshot(profile: Partial<StudyProfileSnapshot> | null | undefined): StudyProfileSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  return {
    school: typeof profile.school === "string" && profile.school.trim() ? profile.school.trim() : "UIC",
    major: typeof profile.major === "string" ? profile.major.trim() : "",
    currentCourses: Array.isArray(profile.currentCourses)
      ? profile.currentCourses.map((course) => String(course).trim()).filter(Boolean)
      : [],
    interests: Array.isArray(profile.interests)
      ? profile.interests.map((interest) => String(interest).trim()).filter(Boolean)
      : [],
    studyPreferences: typeof profile.studyPreferences === "string" ? profile.studyPreferences : "",
    plannerProfile: typeof profile.plannerProfile === "object" && profile.plannerProfile
      ? {
          majorSlug:
            typeof profile.plannerProfile.majorSlug === "string" && profile.plannerProfile.majorSlug.trim()
              ? profile.plannerProfile.majorSlug.trim()
              : undefined,
          currentSemesterNumber:
            Number.isFinite(Number(profile.plannerProfile.currentSemesterNumber))
              ? Number(profile.plannerProfile.currentSemesterNumber)
              : undefined,
          honorsStudent: Boolean(profile.plannerProfile.honorsStudent),
          currentCourses: Array.isArray(profile.plannerProfile.currentCourses)
            ? profile.plannerProfile.currentCourses.map((course) => String(course).trim()).filter(Boolean)
            : [],
          completedCourses: Array.isArray(profile.plannerProfile.completedCourses)
            ? profile.plannerProfile.completedCourses.map((course) => String(course).trim()).filter(Boolean)
            : [],
        }
      : {},
    settings: typeof profile.settings === "object" && profile.settings ? profile.settings : {},
  };
}

export function readLocalStudyProfile() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STUDY_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeStudyProfileSnapshot(JSON.parse(raw) as Partial<StudyProfileSnapshot>);
  } catch {
    return null;
  }
}

export function writeLocalStudyProfile(profile: Partial<StudyProfileSnapshot> | null | undefined) {
  if (typeof window === "undefined") return;

  const normalized = normalizeStudyProfileSnapshot(profile);
  if (!normalized) return;

  window.localStorage.setItem(STUDY_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
}
