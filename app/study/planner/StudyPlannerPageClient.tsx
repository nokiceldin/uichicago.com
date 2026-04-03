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
  );
}

export default function StudyPlannerPageClient() {
  const { data: session, status } = useSession();
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [profileMajor, setProfileMajor] = useState(() => readLocalStudyProfile()?.major ?? "");
  const [profileCurrentCourses, setProfileCurrentCourses] = useState(() => {
    const cached = readLocalStudyProfile();
    return Array.isArray(cached?.currentCourses) ? cached.currentCourses.join(", ") : "";
  });
  const [profileInterests, setProfileInterests] = useState(() => readLocalStudyProfile()?.interests ?? []);
  const [profileStudyPreferences, setProfileStudyPreferences] = useState(() => readLocalStudyProfile()?.studyPreferences ?? "");
  const [plannerProfile, setPlannerProfile] = useState<PlannerProfileState>(() => {
    const cached = readLocalStudyProfile();
    return {
      majorSlug: cached?.plannerProfile?.majorSlug ?? "",
      currentSemesterNumber: Number(cached?.plannerProfile?.currentSemesterNumber ?? 0),
      honorsStudent: Boolean(cached?.plannerProfile?.honorsStudent),
      currentCourses: Array.isArray(cached?.plannerProfile?.currentCourses) ? cached!.plannerProfile.currentCourses! : [],
    };
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

    if (typeof profile.major === "string") setProfileMajor(profile.major);
    if (Array.isArray(profile.currentCourses)) setProfileCurrentCourses(profile.currentCourses.join(", "));
    if (Array.isArray(profile.interests)) setProfileInterests(profile.interests);
    if (typeof profile.studyPreferences === "string") setProfileStudyPreferences(profile.studyPreferences);
    if (profile.plannerProfile) {
      setPlannerProfile({
        majorSlug: typeof profile.plannerProfile.majorSlug === "string" ? profile.plannerProfile.majorSlug : "",
        currentSemesterNumber: Number(profile.plannerProfile.currentSemesterNumber ?? 0),
        honorsStudent: Boolean(profile.plannerProfile.honorsStudent),
        currentCourses: Array.isArray(profile.plannerProfile.currentCourses) ? profile.plannerProfile.currentCourses : [],
      });
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
          setHasLoadedProfile(true);
          return;
        }

        const payload = await response.json();
        if (cancelled) return;

        syncLocalProfile(payload.profile);
        writeLocalStudyProfile(payload.profile);

        setHasLoadedProfile(true);
      } catch {
        setHasLoadedProfile(true);
        return;
      }
    };

    void loadStudyProfile();

    return () => {
      cancelled = true;
    };
  }, [status, syncLocalProfile]);

  const saveAcademicContext = useCallback(async () => {
    if (status !== "authenticated") return;

    const localProfile = {
      school: "UIC",
      major: profileMajor,
      currentCourses: parseCommaSeparated(profileCurrentCourses),
      interests: profileInterests,
      studyPreferences: profileStudyPreferences,
      plannerProfile,
    };

    writeLocalStudyProfile(localProfile);
    window.dispatchEvent(new CustomEvent(STUDY_PROFILE_EVENT, { detail: { profile: localProfile } }));

    try {
      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          major: profileMajor,
          currentCourses: parseCommaSeparated(profileCurrentCourses),
          interests: profileInterests,
          studyPreferences: profileStudyPreferences,
          plannerProfile,
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
    } catch {
      return;
    }
  }, [plannerProfile, profileCurrentCourses, profileInterests, profileMajor, profileStudyPreferences, status, syncLocalProfile]);

  const handleProfileSync = useCallback((next: { major: string; currentCourses: string[] }) => {
    const nextCourses = next.currentCourses.join(", ");
    setProfileMajor((current) => (current === next.major ? current : next.major));
    setProfileCurrentCourses((current) => (current === nextCourses ? current : nextCourses));
  }, []);

  const handlePlannerProfileChange = useCallback((next: PlannerProfileState) => {
    setPlannerProfile((current) => (samePlannerProfile(current, next) ? current : next));
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
              <div className="mt-3 flex flex-wrap gap-2">
                {(profileCurrentCourses ? parseCommaSeparated(profileCurrentCourses).slice(0, 4) : []).map((course) => (
                  <span key={course} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-semibold text-zinc-200">
                    {course}
                  </span>
                ))}
                {!profileCurrentCourses ? (
                  <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-semibold text-zinc-400">
                    Add current or completed courses in your profile
                  </span>
                ) : null}
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
