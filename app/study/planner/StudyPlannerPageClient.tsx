"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, Sparkles } from "lucide-react";
import MySchoolPlanner from "@/app/components/study/MySchoolPlanner";
import { parseCommaSeparated, readLocalStudyProfile, writeLocalStudyProfile } from "@/lib/study/profile";

type PlannerProfileState = {
  majorSlug: string;
  currentSemesterNumber: number;
  honorsStudent: boolean;
  currentCourses: string[];
  completedCourses: string[];
};

const STUDY_PROFILE_EVENT = "uichicago-study-profile-change";

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function samePlannerProfile(a: PlannerProfileState, b: PlannerProfileState) {
  return (
    a.majorSlug === b.majorSlug &&
    a.currentSemesterNumber === b.currentSemesterNumber &&
    a.honorsStudent === b.honorsStudent &&
    sameStringArray(a.currentCourses, b.currentCourses)
    && sameStringArray(a.completedCourses, b.completedCourses)
  );
}

export default function StudyPlannerPageClient() {
  const { data: session, status } = useSession();
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [profileMajor, setProfileMajor] = useState("");
  const [profileCurrentCourses, setProfileCurrentCourses] = useState("");
  const [profileInterests, setProfileInterests] = useState<string[]>([]);
  const [profileStudyPreferences, setProfileStudyPreferences] = useState("");
  const [profileSyncError, setProfileSyncError] = useState("");
  const [plannerProfile, setPlannerProfile] = useState<PlannerProfileState>({
    majorSlug: "",
    currentSemesterNumber: 0,
    honorsStudent: false,
    currentCourses: [],
    completedCourses: [],
  });

  const syncLocalProfile = useCallback((profile: {
    school?: string;
    major?: string;
    currentCourses?: string[];
    interests?: string[];
    studyPreferences?: string;
    plannerProfile?: Partial<PlannerProfileState>;
  } | null | undefined) => {
    if (!profile) return;

    if (typeof profile.major === "string") {
      const nextMajor = profile.major ?? "";
      setProfileMajor((current) => (current === nextMajor ? current : nextMajor));
    }
    if (Array.isArray(profile.currentCourses)) {
      const nextCourses = profile.currentCourses.join(", ");
      setProfileCurrentCourses((current) => (current === nextCourses ? current : nextCourses));
    }
    if (Array.isArray(profile.interests)) {
      setProfileInterests((current) => (sameStringArray(current, profile.interests ?? []) ? current : profile.interests ?? []));
    }
    if (typeof profile.studyPreferences === "string") {
      const nextStudyPreferences = profile.studyPreferences ?? "";
      setProfileStudyPreferences((current) => (current === nextStudyPreferences ? current : nextStudyPreferences));
    }
    if (profile.plannerProfile || Array.isArray(profile.currentCourses)) {
      const nextPlannerProfile: PlannerProfileState = {
        majorSlug: typeof profile.plannerProfile?.majorSlug === "string" ? profile.plannerProfile.majorSlug : "",
        currentSemesterNumber: Number(profile.plannerProfile?.currentSemesterNumber ?? 0),
        honorsStudent: Boolean(profile.plannerProfile?.honorsStudent),
        currentCourses: Array.isArray(profile.plannerProfile?.currentCourses)
          ? profile.plannerProfile.currentCourses
          : Array.isArray(profile.currentCourses)
            ? profile.currentCourses
            : [],
        completedCourses: Array.isArray(profile.plannerProfile?.completedCourses)
          ? profile.plannerProfile.completedCourses
          : [],
      };

      setPlannerProfile((current) => (samePlannerProfile(current, nextPlannerProfile) ? current : nextPlannerProfile));
    }
  }, []);

  useEffect(() => {
    syncLocalProfile(readLocalStudyProfile());

    const handleStudyProfileChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ profile?: {
        school?: string;
        major?: string;
        currentCourses?: string[];
        interests?: string[];
        studyPreferences?: string;
        plannerProfile?: Partial<PlannerProfileState>;
      } }>;
      syncLocalProfile(customEvent.detail?.profile ?? readLocalStudyProfile());
    };

    window.addEventListener(STUDY_PROFILE_EVENT, handleStudyProfileChange);
    return () => window.removeEventListener(STUDY_PROFILE_EVENT, handleStudyProfileChange);
  }, [syncLocalProfile]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const loadStudyProfile = async () => {
      try {
        const response = await fetch("/api/study/me", {
          cache: "no-store",
        });
        if (!response.ok) {
          setProfileSyncError("Could not load your saved planner profile. This device's copy is still available.");
          setHasLoadedProfile(true);
          return;
        }

        const payload = await response.json();
        if (cancelled) return;

        syncLocalProfile(payload.profile);
        writeLocalStudyProfile(payload.profile);
        setProfileSyncError("");

        setHasLoadedProfile(true);
      } catch {
        setProfileSyncError("Could not load your saved planner profile. This device's copy is still available.");
        setHasLoadedProfile(true);
        return;
      }
    };

    void loadStudyProfile();

    return () => {
      cancelled = true;
    };
  }, [status, syncLocalProfile]);

  const saveAcademicContext = useCallback(async (overrides?: {
    major?: string;
    currentCourses?: string[];
    plannerProfile?: Partial<PlannerProfileState>;
  }) => {
    if (status !== "authenticated") return;

    const nextMajor = overrides?.major ?? profileMajor;
    const nextCurrentCourses = overrides?.currentCourses ?? parseCommaSeparated(profileCurrentCourses);
    const nextPlannerProfile: PlannerProfileState = {
      majorSlug: typeof overrides?.plannerProfile?.majorSlug === "string" ? overrides.plannerProfile.majorSlug : plannerProfile.majorSlug,
      currentSemesterNumber: Number(overrides?.plannerProfile?.currentSemesterNumber ?? plannerProfile.currentSemesterNumber),
      honorsStudent: Boolean(overrides?.plannerProfile?.honorsStudent ?? plannerProfile.honorsStudent),
      currentCourses: Array.isArray(overrides?.plannerProfile?.currentCourses) ? overrides!.plannerProfile!.currentCourses! : plannerProfile.currentCourses,
      completedCourses: Array.isArray(overrides?.plannerProfile?.completedCourses)
        ? overrides.plannerProfile.completedCourses
        : plannerProfile.completedCourses,
    };

    const localProfile = {
      school: "UIC",
      major: nextMajor,
      currentCourses: nextCurrentCourses,
      interests: profileInterests,
      studyPreferences: profileStudyPreferences,
      plannerProfile: nextPlannerProfile,
    };

    writeLocalStudyProfile(localProfile);
    window.dispatchEvent(new CustomEvent(STUDY_PROFILE_EVENT, { detail: { profile: localProfile } }));

    try {
      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          major: nextMajor,
          currentCourses: nextCurrentCourses,
          interests: profileInterests,
          studyPreferences: profileStudyPreferences,
          plannerProfile: nextPlannerProfile,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Could not save your school profile.");
      }

      const payload = await response.json().catch(() => null);
      if (payload?.profile) {
        syncLocalProfile(payload.profile);
        writeLocalStudyProfile(payload.profile);
        window.dispatchEvent(new CustomEvent(STUDY_PROFILE_EVENT, { detail: { profile: payload.profile } }));
      }
      setProfileSyncError("");
    } catch (error) {
      setProfileSyncError(error instanceof Error ? error.message : "Could not save your planner profile to your account.");
      return;
    }
  }, [plannerProfile, profileCurrentCourses, profileInterests, profileMajor, profileStudyPreferences, status, syncLocalProfile]);

  const handleProfileSync = useCallback((next: { major: string; currentCourses: string[] }) => {
    const nextCourses = next.currentCourses.join(", ");
    setProfileMajor((current) => (current === next.major ? current : next.major));
    setProfileCurrentCourses((current) => (current === nextCourses ? current : nextCourses));
  }, []);

  const handlePlannerProfileChange = useCallback((next: Omit<PlannerProfileState, "completedCourses">) => {
    setPlannerProfile((current) => {
      const merged = { ...next, completedCourses: current.completedCourses };
      return samePlannerProfile(current, merged) ? current : merged;
    });
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !hasLoadedProfile) return;
    const timeout = window.setTimeout(() => {
      void saveAcademicContext();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [hasLoadedProfile, saveAcademicContext, status]);

  return (
    <main className="min-h-screen bg-transparent pb-20 text-white">
      <div className="mx-auto max-w-[1280px] space-y-6 px-1 pb-16 pt-3 sm:px-2">
        <section className="rounded-[1.6rem] border border-white/10 bg-white/4 p-6">
          {profileSyncError ? (
            <p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-200">
              {profileSyncError}
            </p>
          ) : null}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-200">
                <Sparkles className="h-4 w-4" />
                Saved student context
              </div>
              <div className="mt-3 text-2xl font-bold tracking-[-0.04em] text-white">
                {session?.user?.name || "Your profile"}
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                {profileMajor || "No major saved yet"}
              </div>
            </div>

            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/8"
            >
              Edit profile
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <MySchoolPlanner
          defaultMajor={profileMajor}
          defaultCurrentCourses={profileCurrentCourses}
          initialPlannerProfile={plannerProfile}
          onPlannerProfileChange={handlePlannerProfileChange}
          onProfileSync={handleProfileSync}
          onPersistProfile={saveAcademicContext}
        />
      </div>
    </main>
  );
}
