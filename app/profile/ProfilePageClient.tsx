"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { CheckCircle2, ChevronDown, ChevronRight, Plus, Search, UserRound, X } from "lucide-react";
import { parseCommaSeparated } from "@/lib/study/profile";

type ProfileFormState = {
  school: string;
  major: string;
  majorSlug: string;
  currentCourses: string;
  completedCourses: string;
  interests: string;
  studyPreferences: string;
  currentSemesterNumber: string;
  honorsStudent: boolean;
};

type CourseSuggestion = {
  id: string;
  code: string;
  title: string;
  href: string;
};

type MajorOption = {
  name: string;
  slug: string;
  college: string;
  hasSchedule: boolean;
};

const emptyProfile: ProfileFormState = {
  school: "UIC",
  major: "",
  majorSlug: "",
  currentCourses: "",
  completedCourses: "",
  interests: "",
  studyPreferences: "",
  currentSemesterNumber: "0",
  honorsStudent: false,
};

function serializeProfileForm(form: ProfileFormState) {
  return JSON.stringify({
    school: form.school.trim(),
    major: form.major.trim(),
    majorSlug: form.majorSlug.trim(),
    currentCourses: parseCommaSeparated(form.currentCourses),
    completedCourses: parseCommaSeparated(form.completedCourses),
    interests: parseCommaSeparated(form.interests),
    studyPreferences: form.studyPreferences.trim(),
    currentSemesterNumber: String(Number(form.currentSemesterNumber || "0")),
    honorsStudent: Boolean(form.honorsStudent),
  });
}

export default function ProfilePageClient() {
  const { data: session, status } = useSession();
  const [form, setForm] = useState<ProfileFormState>(emptyProfile);
  const [savedSnapshot, setSavedSnapshot] = useState(serializeProfileForm(emptyProfile));
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [currentClassesOpen, setCurrentClassesOpen] = useState(false);
  const [completedClassesOpen, setCompletedClassesOpen] = useState(false);
  const [currentCourseQuery, setCurrentCourseQuery] = useState("");
  const [completedCourseQuery, setCompletedCourseQuery] = useState("");
  const [currentCourseSuggestions, setCurrentCourseSuggestions] = useState<CourseSuggestion[]>([]);
  const [completedCourseSuggestions, setCompletedCourseSuggestions] = useState<CourseSuggestion[]>([]);
  const [majorOptions, setMajorOptions] = useState<MajorOption[]>([]);
  const [majorPickerOpen, setMajorPickerOpen] = useState(false);
  const majorPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadMajors = async () => {
      try {
        const response = await fetch("/api/study/majors", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled || !payload) return;
        setMajorOptions(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        return;
      }
    };

    void loadMajors();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!majorPickerRef.current?.contains(event.target as Node)) {
        setMajorPickerOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/study/me", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled || !payload) {
          if (!cancelled && payload?.error) {
            setMessage(String(payload.error));
          }
          return;
        }

        const nextForm = {
          school: payload.profile?.school || "UIC",
          major: payload.profile?.major || "",
          majorSlug: payload.profile?.plannerProfile?.majorSlug || "",
          currentCourses: Array.isArray(payload.profile?.currentCourses) ? payload.profile.currentCourses.join(", ") : "",
          completedCourses: Array.isArray(payload.profile?.plannerProfile?.completedCourses) ? payload.profile.plannerProfile.completedCourses.join(", ") : "",
          interests: Array.isArray(payload.profile?.interests) ? payload.profile.interests.join(", ") : "",
          studyPreferences: payload.profile?.studyPreferences || "",
          currentSemesterNumber: String(Number(payload.profile?.plannerProfile?.currentSemesterNumber || 0)),
          honorsStudent: Boolean(payload.profile?.plannerProfile?.honorsStudent),
        };
        setForm(nextForm);
        setSavedSnapshot(serializeProfileForm(nextForm));
      } catch {
        if (!cancelled) {
          setMessage("Could not load your profile.");
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!currentClassesOpen || currentCourseQuery.trim().length < 2) {
      setCurrentCourseSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(currentCourseQuery.trim())}&pageSize=6`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) return;
        setCurrentCourseSuggestions(
          (Array.isArray(payload.items) ? payload.items : []).map((item: { id: string; subject: string; number: string; title: string; href: string }) => ({
            id: item.id,
            code: `${item.subject} ${item.number}`,
            title: item.title,
            href: item.href,
          })),
        );
      } catch {
        setCurrentCourseSuggestions([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [currentClassesOpen, currentCourseQuery]);

  useEffect(() => {
    if (!completedClassesOpen || completedCourseQuery.trim().length < 2) {
      setCompletedCourseSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(completedCourseQuery.trim())}&pageSize=6`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) return;
        setCompletedCourseSuggestions(
          (Array.isArray(payload.items) ? payload.items : []).map((item: { id: string; subject: string; number: string; title: string; href: string }) => ({
            id: item.id,
            code: `${item.subject} ${item.number}`,
            title: item.title,
            href: item.href,
          })),
        );
      } catch {
        setCompletedCourseSuggestions([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [completedClassesOpen, completedCourseQuery]);

  const currentCoursesList = useMemo(() => parseCommaSeparated(form.currentCourses), [form.currentCourses]);
  const completedCoursesList = useMemo(() => parseCommaSeparated(form.completedCourses), [form.completedCourses]);
  const interestList = useMemo(() => parseCommaSeparated(form.interests), [form.interests]);
  const hasUnsavedChanges = useMemo(() => serializeProfileForm(form) !== savedSnapshot, [form, savedSnapshot]);
  const selectedMajor = useMemo(
    () => majorOptions.find((option) => option.slug === form.majorSlug) ?? null,
    [form.majorSlug, majorOptions],
  );
  const filteredMajorOptions = useMemo(() => {
    const query = form.major.trim().toLowerCase();
    const ranked = majorOptions
      .map((option) => {
        const name = option.name.toLowerCase();
        const college = option.college.toLowerCase();
        let score = 0;

        if (!query) score = 1;
        else if (name === query) score = 500;
        else if (name.startsWith(query)) score = 400;
        else if (name.includes(query)) score = 300;
        else if (college.includes(query)) score = 200;

        return { option, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name));

    return ranked.slice(0, query ? 8 : 10).map((entry) => entry.option);
  }, [form.major, majorOptions]);

  const updateCourseField = (field: "currentCourses" | "completedCourses", nextCourses: string[]) => {
    setForm((current) => ({
      ...current,
      [field]: nextCourses.join(", "),
    }));
  };

  const addCourse = (field: "currentCourses" | "completedCourses", code: string) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    const existing = field === "currentCourses" ? currentCoursesList : completedCoursesList;
    if (existing.includes(trimmedCode)) return;
    updateCourseField(field, [...existing, trimmedCode]);
    if (field === "currentCourses") {
      setCurrentCourseQuery("");
      setCurrentCourseSuggestions([]);
    } else {
      setCompletedCourseQuery("");
      setCompletedCourseSuggestions([]);
    }
  };

  const removeCourse = (field: "currentCourses" | "completedCourses", code: string) => {
    const existing = field === "currentCourses" ? currentCoursesList : completedCoursesList;
    updateCourseField(field, existing.filter((course) => course !== code));
  };

  const selectMajor = (major: MajorOption) => {
    setForm((current) => ({
      ...current,
      major: major.name,
      majorSlug: major.slug,
    }));
    setMajorPickerOpen(false);
  };

  const saveProfile = async () => {
    if (status !== "authenticated") {
      void signIn("google", { callbackUrl: "/profile" });
      return;
    }
    if (!hasUnsavedChanges) return;

    try {
      setIsSaving(true);
      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: form.school,
          major: form.major,
          currentCourses: parseCommaSeparated(form.currentCourses),
          interests: parseCommaSeparated(form.interests),
          studyPreferences: form.studyPreferences,
          plannerProfile: {
            majorSlug: form.majorSlug,
            currentSemesterNumber: Number(form.currentSemesterNumber || "0"),
            honorsStudent: form.honorsStudent,
            currentCourses: parseCommaSeparated(form.currentCourses),
            completedCourses: parseCommaSeparated(form.completedCourses),
          },
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save your profile.");
      }

      setSavedSnapshot(serializeProfileForm(form));
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "loading" || (status === "authenticated" && !loaded)) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_36%),#fafafa] px-4 py-10 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(129,58,58,0.18),transparent_36%),#09090b] dark:text-white sm:px-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="h-[520px] animate-pulse rounded-[2rem] border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04]" />
        </div>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_36%),#fafafa] px-4 py-10 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(129,58,58,0.18),transparent_36%),#09090b] dark:text-white sm:px-6">
        <div className="mx-auto max-w-[960px] rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
            <UserRound className="h-4 w-4" />
            Your profile
          </div>
          <h1 className="mt-6 text-[2.5rem] font-black tracking-[-0.06em] text-zinc-950 dark:text-white">One place for the context your whole workspace needs.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
            Save your major, classes, and study preferences once so planning, study tools, and Sparky can personalize around you.
          </p>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/profile" })}
            className="mt-8 inline-flex items-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  const displayName = session?.user?.name || "Your profile";
  const email = session?.user?.email || "";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_36%),#fafafa] px-4 py-10 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(129,58,58,0.18),transparent_36%),#09090b] dark:text-white sm:px-6">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <section className="rounded-[1.8rem] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff,#f6f6f7)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.28)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Your profile</div>
              <h1 className="mt-2 text-[2.1rem] font-black tracking-[-0.06em] text-zinc-950 dark:text-white sm:text-[2.5rem]">
                Keep your academic context tidy.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                Save your major, semester, classes, and preferences here so the rest of the site can adapt without crowding the page.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
                  {selectedMajor?.name || form.major.trim() || "No major yet"}
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
                  {currentCoursesList.length} current classes
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
                  {completedCoursesList.length} completed classes
                </span>
                {form.honorsStudent ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
                    Honors student
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <div className="text-sm text-zinc-500 dark:text-zinc-400">{displayName}</div>
              <button
                type="button"
                onClick={saveProfile}
                disabled={isSaving || !hasUnsavedChanges}
                className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                  isSaving || !hasUnsavedChanges
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-500"
                    : "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
                }`}
              >
                {isSaving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[1.8rem] border border-zinc-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.28)] sm:p-7">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Account context</div>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-zinc-950 dark:text-white">{displayName}</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{email}</p>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">School</div>
                <input
                  value={form.school}
                  onChange={(event) => setForm((current) => ({ ...current, school: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Major</div>
                <div ref={majorPickerRef} className="relative">
                  <input
                    value={form.major}
                    onFocus={() => setMajorPickerOpen(true)}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setForm((current) => ({
                        ...current,
                        major: nextValue,
                        majorSlug: current.majorSlug && selectedMajor?.name === nextValue ? current.majorSlug : "",
                      }));
                      setMajorPickerOpen(true);
                    }}
                    placeholder="Start typing your major"
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 pr-10 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                  />
                  <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />

                  {majorPickerOpen ? (
                    <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[#18181d]">
                      {filteredMajorOptions.length ? (
                        filteredMajorOptions.map((major) => {
                          const isSelected = form.majorSlug === major.slug;
                          return (
                            <button
                              key={major.slug}
                              type="button"
                              onClick={() => selectMajor(major)}
                              className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-zinc-900 dark:text-white">{major.name}</div>
                                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{major.college}</div>
                              </div>
                              {isSelected ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                          No exact major matches yet. Keep typing or pick from the official list when it appears.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {selectedMajor
                    ? `Selected major: ${selectedMajor.name}`
                    : "Choose one of the official majors so planning and Sparky use the exact program."}
                </div>
              </label>
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current semester</div>
                <select
                  value={form.currentSemesterNumber}
                  onChange={(event) => setForm((current) => ({ ...current, currentSemesterNumber: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                >
                  <option value="0">Not set yet</option>
                  <option value="1">1st semester</option>
                  <option value="2">2nd semester</option>
                  <option value="3">3rd semester</option>
                  <option value="4">4th semester</option>
                  <option value="5">5th semester</option>
                  <option value="6">6th semester</option>
                  <option value="7">7th semester</option>
                  <option value="8">8th semester</option>
                </select>
              </label>
              <div className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Honors student</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, honorsStudent: false }))}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${!form.honorsStudent ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-white/20 dark:bg-white/[0.08] dark:text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:text-white"}`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, honorsStudent: true }))}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${form.honorsStudent ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-white/20 dark:bg-white/[0.08] dark:text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:text-white"}`}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setCurrentClassesOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current classes</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">
                      {currentCoursesList.length ? `${currentCoursesList.length} classes saved` : "No current classes yet"}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${currentClassesOpen ? "rotate-180" : ""}`} />
                </button>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(currentCoursesList.length ? currentCoursesList.slice(0, currentClassesOpen ? currentCoursesList.length : 4) : ["Add classes like CS 251 or BIOS 120"]).map((course) => (
                    currentCoursesList.length ? (
                      <span key={course} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200">
                        {course}
                        {currentClassesOpen ? (
                          <button
                            type="button"
                            onClick={() => removeCourse("currentCourses", course)}
                            className="text-zinc-400 transition hover:text-white"
                            aria-label={`Remove ${course}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <span key={course} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
                        {course}
                      </span>
                    )
                  ))}
                  {!currentClassesOpen && currentCoursesList.length > 4 ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
                      +{currentCoursesList.length - 4} more
                    </span>
                  ) : null}
                </div>

                {currentClassesOpen ? (
                  <div className="mt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Add current class</div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={currentCourseQuery}
                        onChange={(event) => setCurrentCourseQuery(event.target.value)}
                        placeholder="Search courses like CS 251 or BIOS 120"
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-12 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const firstSuggestion = currentCourseSuggestions[0];
                          if (firstSuggestion) addCourse("currentCourses", firstSuggestion.code);
                        }}
                        disabled={!currentCourseSuggestions.length}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 transition enabled:hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/[0.08] dark:text-zinc-200 dark:enabled:hover:bg-white/[0.14]"
                        aria-label="Add current class"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {currentCourseSuggestions.length ? (
                      <div className="mt-3 space-y-2">
                        {currentCourseSuggestions.map((course) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => addCourse("currentCourses", course.code)}
                            className="flex w-full items-start justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                          >
                            <div>
                              <div className="text-sm font-semibold text-zinc-900 dark:text-white">{course.code}</div>
                              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{course.title}</div>
                            </div>
                            <Plus className="mt-0.5 h-4 w-4 text-zinc-400" />
                          </button>
                        ))}
                      </div>
                    ) : currentCourseQuery.trim().length >= 2 ? (
                      <div className="mt-3 text-sm text-zinc-500">No matching courses yet.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setCompletedClassesOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Completed classes</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">
                      {completedCoursesList.length ? `${completedCoursesList.length} classes saved` : "No completed classes yet"}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${completedClassesOpen ? "rotate-180" : ""}`} />
                </button>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(completedCoursesList.length ? completedCoursesList.slice(0, completedClassesOpen ? completedCoursesList.length : 6) : ["Add completed classes when you want planning to use them"]).map((course) => (
                    completedCoursesList.length ? (
                      <span key={course} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200">
                        {course}
                        {completedClassesOpen ? (
                          <button
                            type="button"
                            onClick={() => removeCourse("completedCourses", course)}
                            className="text-zinc-400 transition hover:text-white"
                            aria-label={`Remove ${course}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <span key={course} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
                        {course}
                      </span>
                    )
                  ))}
                  {!completedClassesOpen && completedCoursesList.length > 6 ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
                      +{completedCoursesList.length - 6} more
                    </span>
                  ) : null}
                </div>

                {completedClassesOpen ? (
                  <div className="mt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Add completed class</div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={completedCourseQuery}
                        onChange={(event) => setCompletedCourseQuery(event.target.value)}
                        placeholder="Search courses like MATH 180 or CS 141"
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-12 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const firstSuggestion = completedCourseSuggestions[0];
                          if (firstSuggestion) addCourse("completedCourses", firstSuggestion.code);
                        }}
                        disabled={!completedCourseSuggestions.length}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 transition enabled:hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/[0.08] dark:text-zinc-200 dark:enabled:hover:bg-white/[0.14]"
                        aria-label="Add completed class"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {completedCourseSuggestions.length ? (
                      <div className="mt-3 space-y-2">
                        {completedCourseSuggestions.map((course) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => addCourse("completedCourses", course.code)}
                            className="flex w-full items-start justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                          >
                            <div>
                              <div className="text-sm font-semibold text-zinc-900 dark:text-white">{course.code}</div>
                              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{course.title}</div>
                            </div>
                            <Plus className="mt-0.5 h-4 w-4 text-zinc-400" />
                          </button>
                        ))}
                      </div>
                    ) : completedCourseQuery.trim().length >= 2 ? (
                      <div className="mt-3 text-sm text-zinc-500">No matching courses yet.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Academic interests</div>
                <input
                  value={form.interests}
                  onChange={(event) => setForm((current) => ({ ...current, interests: event.target.value }))}
                  placeholder="Algorithms, AI, internship prep, group study"
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Study and response preferences</div>
                <textarea
                  value={form.studyPreferences}
                  onChange={(event) => setForm((current) => ({ ...current, studyPreferences: event.target.value }))}
                  rows={4}
                  placeholder="Examples: likes concise answers, prefers quiz-heavy practice, wants step-by-step planning help"
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
              </label>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))]">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Next best places</div>
              <div className="mt-4 space-y-3">
                <Link href="/study/planner" className="flex items-center justify-between rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]">
                  <span>Open degree planner</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
                <Link href="/study" className="flex items-center justify-between rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]">
                  <span>Open study workspace</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
                <Link href="/chat" className="flex items-center justify-between rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]">
                  <span>Talk to Sparky</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-400/20 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
                What matters most here
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(interestList.length ? interestList.slice(0, 4) : ["Preferences and course context drive better recommendations"]).map((item) => (
                  <span key={item} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-50">
                    {item}
                  </span>
                ))}
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-800 dark:text-emerald-50/90">
                <li>Major and class history help planning avoid generic recommendations.</li>
                <li>Current classes give Sparky and study tools immediate context.</li>
                <li>Study preferences help the site adapt tone and structure more naturally.</li>
              </ul>
            </div>
          </div>
        </section>

        {message ? (
          <div className="fixed bottom-5 right-5 z-50 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[0_18px_45px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)] dark:text-white">
            {message}
          </div>
        ) : null}
      </div>
    </main>
  );
}
