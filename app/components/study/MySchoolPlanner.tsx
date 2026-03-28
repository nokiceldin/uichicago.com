"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, RotateCcw, Search, Sparkles, Target, X } from "lucide-react";

type PlannerCourseOption = {
  code: string;
  title: string;
  totalRegsAllTime: number;
};

type PlannerCourse = {
  slotId: string;
  code: string;
  title: string;
  credits: number | null;
  bucket: string;
  bucketLabel: string;
  kind: "required" | "elective";
  popularityReason: string | null;
  totalRegsAllTime: number | null;
  alternatives: PlannerCourseOption[];
  status: "completed" | "in_progress" | "planned";
};

type PlannerSemester = {
  id: string;
  label: string;
  year: string;
  semester: string;
  totalHours: number | null;
  courses: PlannerCourse[];
};

type PlannerResult = {
  majorName: string;
  catalogUrl: string | null;
  planLengthLabel: string;
  inferredCompletedCourses: string[];
  completedCourses: string[];
  currentCourses: string[];
  semesters: PlannerSemester[];
};

type MajorOption = {
  name: string;
  slug: string;
  college: string;
  hasSchedule: boolean;
};

type CourseSearchResult = {
  id: string;
  subject: string;
  number: string;
  title: string;
  href: string;
};

type SelectedCourse = {
  code: string;
  title: string;
};

type Props = {
  defaultMajor: string;
  defaultCurrentCourses: string;
  initialPlannerProfile: {
    majorSlug: string;
    currentSemesterNumber: number;
    honorsStudent: boolean;
    currentCourses: string[];
    completedCourses: string[];
  };
  onPlannerProfileChange: (profile: {
    majorSlug: string;
    currentSemesterNumber: number;
    honorsStudent: boolean;
    currentCourses: string[];
    completedCourses: string[];
  }) => void;
  onProfileSync: (profile: { major: string; currentCourses: string[] }) => void;
  onPersistProfile: () => void;
};

function statusClasses(status: PlannerCourse["status"]) {
  if (status === "completed") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (status === "in_progress") return "border-sky-400/25 bg-sky-500/10 text-sky-100";
  return "border-white/10 bg-white/[0.04] text-zinc-200";
}

function normalizeCourseCode(value: string) {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

function parseCourseCodes(value: string) {
  return value
    .split(",")
    .map((entry) => normalizeCourseCode(entry))
    .filter(Boolean);
}

function dedupeCourses(courses: SelectedCourse[]) {
  const seen = new Set<string>();
  return courses.filter((course) => {
    if (seen.has(course.code)) return false;
    seen.add(course.code);
    return true;
  });
}

function courseBadgeClasses(kind: "current" | "completed") {
  return kind === "current"
    ? "border-sky-400/20 bg-sky-500/10 text-sky-100"
    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
}

function CoursePicker({
  label,
  placeholder,
  query,
  onQueryChange,
  results,
  selected,
  onAddCourse,
  onRemoveCourse,
  tone,
}: {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  results: CourseSearchResult[];
  selected: SelectedCourse[];
  onAddCourse: (course: SelectedCourse) => void;
  onRemoveCourse: (code: string) => void;
  tone: "current" | "completed";
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </div>

      {results.length ? (
        <div className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-[#1e1938]">
          {results.map((course) => {
            const code = `${course.subject} ${course.number}`;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => {
                  onAddCourse({ code, title: course.title });
                  onQueryChange("");
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-white/6 px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.04]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{code}</div>
                  <div className="truncate text-xs text-zinc-400">{course.title}</div>
                </div>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-100">
                  <Plus className="h-4 w-4" />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {selected.length ? (
          selected.map((course) => (
            <div
              key={course.code}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${courseBadgeClasses(tone)}`}
            >
              <span>{course.code}</span>
              <button type="button" onClick={() => onRemoveCourse(course.code)} className="text-current/80 transition hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        ) : (
          <div className="text-sm text-zinc-500">No courses selected yet.</div>
        )}
      </div>
    </div>
  );
}

export default function MySchoolPlanner({
  defaultMajor,
  defaultCurrentCourses,
  initialPlannerProfile,
  onPlannerProfileChange,
  onProfileSync,
  onPersistProfile,
}: Props) {
  const [majorOptions, setMajorOptions] = useState<MajorOption[]>([]);
  const [selectedMajorSlug, setSelectedMajorSlug] = useState("");
  const [currentSemesterNumber, setCurrentSemesterNumber] = useState("0");
  const [planLength, setPlanLength] = useState<"one_semester" | "one_year" | "two_years" | "three_years" | "remaining" | "full">("remaining");
  const [currentCourseQuery, setCurrentCourseQuery] = useState("");
  const [completedCourseQuery, setCompletedCourseQuery] = useState("");
  const [currentCourseResults, setCurrentCourseResults] = useState<CourseSearchResult[]>([]);
  const [completedCourseResults, setCompletedCourseResults] = useState<CourseSearchResult[]>([]);
  const [selectedCurrentCourses, setSelectedCurrentCourses] = useState<SelectedCourse[]>([]);
  const [selectedCompletedCourses, setSelectedCompletedCourses] = useState<SelectedCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<PlannerResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadMajors = async () => {
      try {
        const response = await fetch("/api/study/majors", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        const items = Array.isArray(payload.items) ? (payload.items as MajorOption[]) : [];
        setMajorOptions(items);

        if (!items.length) return;

        const normalizedDefault = defaultMajor.trim().toLowerCase();
        const matched =
          items.find((item) => item.slug === defaultMajor) ||
          items.find((item) => item.name.toLowerCase() === normalizedDefault) ||
          items.find((item) => item.name.toLowerCase().includes(normalizedDefault) || normalizedDefault.includes(item.name.toLowerCase()));

        if (matched) {
          setSelectedMajorSlug(matched.slug);
        }
      } catch {
        return;
      }
    };

    void loadMajors();

    return () => {
      cancelled = true;
    };
  }, [defaultMajor]);

  useEffect(() => {
    const defaults = parseCourseCodes(defaultCurrentCourses).map((code) => ({ code, title: code }));
    if (defaults.length) {
      setSelectedCurrentCourses((current) => (current.length ? current : defaults));
    }
  }, [defaultCurrentCourses]);

  useEffect(() => {
    if (initialPlannerProfile.majorSlug) {
      setSelectedMajorSlug(initialPlannerProfile.majorSlug);
    }
    if (initialPlannerProfile.currentSemesterNumber) {
      setCurrentSemesterNumber(String(initialPlannerProfile.currentSemesterNumber));
    }

    if (initialPlannerProfile.currentCourses.length) {
      setSelectedCurrentCourses((current) =>
        current.length
          ? current
          : initialPlannerProfile.currentCourses.map((code) => ({ code, title: code })),
      );
    }

    if (initialPlannerProfile.completedCourses.length) {
      setSelectedCompletedCourses((current) =>
        current.length
          ? current
          : initialPlannerProfile.completedCourses.map((code) => ({ code, title: code })),
      );
    }
  }, [initialPlannerProfile]);

  useEffect(() => {
    const query = currentCourseQuery.trim();
    if (query.length < 2) {
      setCurrentCourseResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(query)}&pageSize=6`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) return;
        setCurrentCourseResults(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        setCurrentCourseResults([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [currentCourseQuery]);

  useEffect(() => {
    const query = completedCourseQuery.trim();
    if (query.length < 2) {
      setCompletedCourseResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(query)}&pageSize=6`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) return;
        setCompletedCourseResults(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        setCompletedCourseResults([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [completedCourseQuery]);

  const selectedMajor = useMemo(
    () => majorOptions.find((option) => option.slug === selectedMajorSlug) ?? null,
    [majorOptions, selectedMajorSlug],
  );

  useEffect(() => {
    onPlannerProfileChange({
      majorSlug: selectedMajorSlug,
      currentSemesterNumber: Number(currentSemesterNumber || "0"),
      honorsStudent: Boolean(initialPlannerProfile.honorsStudent),
      currentCourses: selectedCurrentCourses.map((course) => course.code),
      completedCourses: selectedCompletedCourses.map((course) => course.code),
    });
  }, [currentSemesterNumber, initialPlannerProfile.honorsStudent, onPlannerProfileChange, selectedCompletedCourses, selectedCurrentCourses, selectedMajorSlug]);

  useEffect(() => {
    onProfileSync({
      major: selectedMajor?.name ?? defaultMajor,
      currentCourses: selectedCurrentCourses.map((course) => course.code),
    });
  }, [defaultMajor, onProfileSync, selectedCurrentCourses, selectedMajor]);

  const plannedCounts = useMemo(() => {
    if (!plan) return [];
    const buckets = new Map<string, number>();
    for (const semester of plan.semesters) {
      for (const course of semester.courses) {
        if (course.status !== "planned") continue;
        buckets.set(course.bucketLabel, (buckets.get(course.bucketLabel) ?? 0) + 1);
      }
    }
    return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [plan]);

  const handleGenerate = async () => {
    if (!selectedMajor) {
      setError("Pick your major from the official list first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/study/degree-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          major: selectedMajor.name,
          majorSlug: selectedMajor.slug,
          currentSemesterNumber: Number(currentSemesterNumber || "0"),
          planLength,
          currentCourses: selectedCurrentCourses.map((course) => course.code),
          completedCourses: selectedCompletedCourses.map((course) => course.code),
          honorsStudent: Boolean(initialPlannerProfile.honorsStudent),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not generate your plan.");
      }
      setPlan(payload.plan as PlannerResult);
      onPersistProfile();
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "Could not generate your plan.");
    } finally {
      setLoading(false);
    }
  };

  const addCurrentCourse = (course: SelectedCourse) => {
    setSelectedCurrentCourses((current) => dedupeCourses([...current, course]));
  };

  const addCompletedCourse = (course: SelectedCourse) => {
    setSelectedCompletedCourses((current) => dedupeCourses([...current, course]));
  };

  const removeCurrentCourse = (code: string) => {
    setSelectedCurrentCourses((current) => current.filter((course) => course.code !== code));
  };

  const removeCompletedCourse = (code: string) => {
    setSelectedCompletedCourses((current) => current.filter((course) => course.code !== code));
  };

  const markTaken = (slotId: string) => {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        semesters: current.semesters.map((semester) => ({
          ...semester,
          courses: semester.courses.map((course) =>
            course.slotId === slotId
              ? { ...course, status: "completed" }
              : course,
          ),
        })),
      };
    });
    const plannedCourse = plan?.semesters.flatMap((semester) => semester.courses).find((course) => course.slotId === slotId);
    if (plannedCourse) {
      setSelectedCompletedCourses((current) => dedupeCourses([...current, { code: plannedCourse.code, title: plannedCourse.title }]));
      setSelectedCurrentCourses((current) => current.filter((course) => course.code !== plannedCourse.code));
      onPersistProfile();
    }
  };

  const swapElective = (slotId: string) => {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        semesters: current.semesters.map((semester) => ({
          ...semester,
          courses: semester.courses.map((course) => {
            if (course.slotId !== slotId || course.kind !== "elective" || course.alternatives.length < 2) {
              return course;
            }
            const currentIndex = course.alternatives.findIndex((option) => option.code === course.code);
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % course.alternatives.length : 0;
            const next = course.alternatives[nextIndex];
            return {
              ...course,
              code: next.code,
              title: next.title,
              totalRegsAllTime: next.totalRegsAllTime,
              popularityReason: `Swapped to another approved ${course.bucketLabel.toLowerCase()} option (${next.totalRegsAllTime.toLocaleString()} registrations).`,
              status: "planned",
            };
          }),
        })),
      };
    });
  };

  return (
    <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(36,24,61,0.94),rgba(15,19,31,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 px-6 py-6 sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-200">
              <Sparkles className="h-4 w-4" />
              My School Planner
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-white sm:text-[2.1rem]">
              Build a clean semester-by-semester degree plan around the student.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              Pick your major from the official degree list, add your current and completed courses from real UIC course search, and then generate the roadmap from that exact context and the major&apos;s sample schedule.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full bg-[#5b54ef] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6a63ff] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Generating..." : "Generate plan"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 sm:px-7 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-5">
          <label className="block">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Major</div>
            <select
              value={selectedMajorSlug}
              onChange={(event) => setSelectedMajorSlug(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none"
            >
              <option value="">Choose your major</option>
              {majorOptions.map((major) => (
                <option key={major.slug} value={major.slug}>
                  {major.name}
                </option>
              ))}
            </select>
            {selectedMajor ? (
              <div className="mt-2 text-xs text-zinc-400">{selectedMajor.college}</div>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">Only majors from your actual planning dataset can be selected here.</div>
            )}
          </label>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current semester</div>
              <select
                value={currentSemesterNumber}
                onChange={(event) => setCurrentSemesterNumber(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none"
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

            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Plan length</div>
              <select
                value={planLength}
                onChange={(event) => setPlanLength(event.target.value as typeof planLength)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none"
              >
                <option value="one_semester">Just one semester</option>
                <option value="one_year">One year</option>
                <option value="two_years">Two years</option>
                <option value="three_years">Three years</option>
                <option value="remaining">Remaining semesters</option>
                <option value="full">Full plan</option>
              </select>
            </label>
          </div>

          <CoursePicker
            label="Current courses"
            placeholder="Search and add current classes"
            query={currentCourseQuery}
            onQueryChange={setCurrentCourseQuery}
            results={currentCourseResults}
            selected={selectedCurrentCourses}
            onAddCourse={addCurrentCourse}
            onRemoveCourse={removeCurrentCourse}
            tone="current"
          />

          <CoursePicker
            label="Already taken courses"
            placeholder="Search and add completed classes"
            query={completedCourseQuery}
            onQueryChange={setCompletedCourseQuery}
            results={completedCourseResults}
            selected={selectedCompletedCourses}
            onAddCourse={addCompletedCourse}
            onRemoveCourse={removeCompletedCourse}
            tone="completed"
          />

          <div className="rounded-[1.2rem] border border-indigo-400/20 bg-indigo-500/10 p-3 text-xs leading-6 text-indigo-100">
            The generator now reads the exact major you picked plus the exact class codes you added, then builds from that major&apos;s sample schedule instead of guessing from free text.
          </div>

          {error ? (
            <div className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          {!plan ? (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-[1.6rem] border border-dashed border-white/12 bg-white/[0.03] p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-indigo-200">
                  <Target className="h-6 w-6" />
                </div>
                <div className="mt-5 text-xl font-semibold text-white">Generate a personalized roadmap</div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Choose a major from the official list, add current and completed UIC classes, and the planner will generate from the matching sample schedule.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Generated plan</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{plan.majorName}</div>
                  <div className="mt-2 text-sm text-zinc-300">{plan.planLengthLabel}</div>
                  {plan.catalogUrl ? (
                    <a href={plan.catalogUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-indigo-200 transition hover:text-white">
                      Open catalog reference
                    </a>
                  ) : null}
                  {plan.inferredCompletedCourses.length ? (
                    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      Inferred {plan.inferredCompletedCourses.length} completed courses from the semesters before your current one.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">What is planned</div>
                  <div className="mt-4 space-y-2">
                    {plannedCounts.length ? plannedCounts.map(([label, count]) => (
                      <div key={label} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200">
                        <span>{label}</span>
                        <span className="font-semibold text-white">{count}</span>
                      </div>
                    )) : (
                      <div className="text-sm text-zinc-400">Everything in this view is already marked completed or in progress.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {plan.semesters.map((semester) => (
                  <section key={semester.id} className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{semester.year}</div>
                        <h3 className="mt-1 text-base font-semibold tracking-[-0.03em] text-white">{semester.label}</h3>
                      </div>
                      <div className="text-sm text-zinc-400">{semester.totalHours ? `${semester.totalHours} credits` : "Credits vary"}</div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {semester.courses.map((course) => (
                        <div key={course.slotId} className={`rounded-[0.95rem] border px-3 py-2.5 ${statusClasses(course.status)}`}>
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-white">{course.code}</span>
                                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-200">
                                  {course.bucketLabel}
                                </span>
                                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                                  {course.status === "completed" ? "Taken" : course.status === "in_progress" ? "Current" : "Planned"}
                                </span>
                              </div>
                              <div className="mt-1 line-clamp-2 text-sm text-zinc-200">{course.title}</div>
                              <div className="mt-0.5 text-[11px] text-zinc-400">
                                {course.credits ? `${course.credits} credits` : "Credits vary"}
                                {course.popularityReason ? ` • ${course.popularityReason}` : ""}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              {course.status !== "completed" ? (
                                <button
                                  type="button"
                                  onClick={() => markTaken(course.slotId)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Already taken
                                </button>
                              ) : null}
                              {course.kind === "elective" && course.alternatives.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => swapElective(course.slotId)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-100 transition hover:bg-white/[0.1]"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Swap option
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
