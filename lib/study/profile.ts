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
