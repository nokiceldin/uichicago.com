"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, Sparkles } from "lucide-react";
import MySchoolPlanner from "@/app/components/study/MySchoolPlanner";
import { parseCommaSeparated } from "@/lib/study/profile";

type PlannerProfileState = {
  majorSlug: string;
  currentSemesterNumber: number;
  honorsStudent: boolean;
  currentCourses: string[];
  completedCourses: string[];
};

export default function StudyPlannerPageClient() {
  const { data: session, status } = useSession();
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [profileMajor, setProfileMajor] = useState("");
  const [profileCurrentCourses, setProfileCurrentCourses] = useState("");
  const [profileInterests, setProfileInterests] = useState<string[]>([]);
  const [profileStudyPreferences, setProfileStudyPreferences] = useState("");
  const [plannerProfile, setPlannerProfile] = useState<PlannerProfileState>({
    majorSlug: "",
    currentSemesterNumber: 0,
    honorsStudent: false,
    currentCourses: [],
    completedCourses: [],
  });

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const loadStudyProfile = async () => {
      try {
        const response = await fetch("/api/study/me", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = await response.json();
        if (cancelled) return;

        setProfileMajor(payload.profile?.major || "");
        setProfileCurrentCourses(Array.isArray(payload.profile?.currentCourses) ? payload.profile.currentCourses.join(", ") : "");
        setProfileInterests(Array.isArray(payload.profile?.interests) ? payload.profile.interests : []);
        setProfileStudyPreferences(payload.profile?.studyPreferences || "");

        setPlannerProfile({
          majorSlug: payload.profile?.plannerProfile?.majorSlug || "",
          currentSemesterNumber: Number(payload.profile?.plannerProfile?.currentSemesterNumber || 0),
          honorsStudent: Boolean(payload.profile?.plannerProfile?.honorsStudent),
          currentCourses: Array.isArray(payload.profile?.plannerProfile?.currentCourses) ? payload.profile.plannerProfile.currentCourses : [],
          completedCourses: Array.isArray(payload.profile?.plannerProfile?.completedCourses) ? payload.profile.plannerProfile.completedCourses : [],
        });

        setHasLoadedProfile(true);
      } catch {
        return;
      }
    };

    void loadStudyProfile();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const saveAcademicContext = useCallback(async () => {
    if (status !== "authenticated") return;

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
    } catch {
      return;
    }
  }, [plannerProfile, profileCurrentCourses, profileInterests, profileMajor, profileStudyPreferences, status]);

  const handleProfileSync = useCallback((next: { major: string; currentCourses: string[] }) => {
    const nextCourses = next.currentCourses.join(", ");
    setProfileMajor((current) => (current === next.major ? current : next.major));
    setProfileCurrentCourses((current) => (current === nextCourses ? current : nextCourses));
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
        <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-6">
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
                  <span key={course} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-200">
                    {course}
                  </span>
                ))}
                {!profileCurrentCourses ? (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-400">
                    Add current classes in your profile
                  </span>
                ) : null}
              </div>
            </div>

            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
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
          onPlannerProfileChange={setPlannerProfile}
          onProfileSync={handleProfileSync}
          onPersistProfile={saveAcademicContext}
        />
      </div>
    </main>
  );
}
