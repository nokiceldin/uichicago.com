"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  GraduationCap,
  Layers3,
  Pencil,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import type { CsAudit } from "@/lib/academic/cs-audit";

type PlannerCourseOption = {
  code: string;
  title: string;
  totalRegsAllTime: number;
  eligibility?: PlannerEligibility;
};

type PlannerEligibility = {
  status: "eligible" | "blocked" | "review";
  satisfied: string[];
  missing: string[];
  unresolved: string[];
  sourceText: string | null;
};

type PlannerCourse = {
  slotId: string;
  code: string;
  title: string;
  credits: number | null;
  countsTowardGraduation?: boolean;
  bucket: string;
  bucketLabel: string;
  kind: "required" | "elective";
  popularityReason: string | null;
  totalRegsAllTime: number | null;
  alternatives: PlannerCourseOption[];
  status: "completed" | "in_progress" | "planned";
  eligibility?: PlannerEligibility;
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
  audit: CsAudit | null;
  warnings: string[];
  unscheduledRequirements: PlannerCourse[];
  majorName: string;
  degreeTotalHours: number | null;
  catalogUrl: string | null;
  planLengthLabel: string;
  inferredCompletedCourses: string[];
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
    auditImport?: { metadata: { catalogCode: string | null } };
    completedCourses?: string[];
    majorSlug: string;
    currentSemesterNumber: number;
    honorsStudent: boolean;
    currentCourses: string[];
  };
  onPlannerProfileChange: (profile: {
    majorSlug: string;
    currentSemesterNumber: number;
    honorsStudent: boolean;
    currentCourses: string[];
  }) => void;
  onProfileSync: (profile: { major: string; currentCourses: string[] }) => void;
  onPersistProfile: (overrides?: {
    major?: string;
    currentCourses?: string[];
    plannerProfile?: {
      majorSlug: string;
      currentSemesterNumber: number;
      honorsStudent: boolean;
      currentCourses: string[];
    };
  }) => void;
};

function statusClasses(status: PlannerCourse["status"]) {
  if (status === "completed") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (status === "in_progress") return "border-sky-400/25 bg-sky-500/10 text-sky-100";
  return "border-white/10 bg-white/4 text-zinc-200";
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

function sameSelectedCourses(a: SelectedCourse[], b: SelectedCourse[]) {
  return (
    a.length === b.length &&
    a.every((course, index) => course.code === b[index]?.code)
  );
}

function courseBadgeClasses() {
  return "border-sky-400/20 bg-sky-500/10 text-sky-100";
}

function academicYearNumber(label: string, fallbackIndex: number) {
  const normalized = label.toLowerCase();
  if (normalized.includes("freshman") || normalized.includes("first year")) return 1;
  if (normalized.includes("sophomore") || normalized.includes("second year")) return 2;
  if (normalized.includes("junior") || normalized.includes("third year")) return 3;
  if (normalized.includes("senior") || normalized.includes("fourth year")) return 4;
  const numericYear = normalized.match(/(?:year|yr)\s*(\d+)/)?.[1];
  return numericYear ? Number(numericYear) : fallbackIndex + 1;
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
}: {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  results: CourseSearchResult[];
  selected: SelectedCourse[];
  onAddCourse: (course: SelectedCourse) => void;
  onRemoveCourse: (code: string) => void;
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
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
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
                className="flex w-full items-center justify-between gap-3 border-b border-white/6 px-4 py-3 text-left last:border-b-0 hover:bg-white/4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{code}</div>
                  <div className="truncate text-xs text-zinc-400">{course.title}</div>
                </div>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-100">
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${courseBadgeClasses()}`}
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
  const [planLength, setPlanLength] = useState<"remaining" | "full">("full");
  const [currentCourseQuery, setCurrentCourseQuery] = useState("");
  const [currentCourseResults, setCurrentCourseResults] = useState<CourseSearchResult[]>([]);
  const [selectedCurrentCourses, setSelectedCurrentCourses] = useState<SelectedCourse[]>([]);
  const [shouldPersistCourseSelection, setShouldPersistCourseSelection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storedPlan, setPlan] = useState<PlannerResult | null>(null);
  const [generatedForKey, setGeneratedForKey] = useState("");
  const inputKey = JSON.stringify([selectedMajorSlug, currentSemesterNumber, planLength,
    selectedCurrentCourses.map(course => course.code), initialPlannerProfile.completedCourses ?? [], initialPlannerProfile.honorsStudent, initialPlannerProfile.auditImport?.metadata.catalogCode]);
  // An edited record must never continue showing an audit of the previous record.
  const plan = generatedForKey === inputKey ? storedPlan : null;

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
    const nextMajorSlug = initialPlannerProfile.majorSlug || "";
    const nextSemesterNumber = String(initialPlannerProfile.currentSemesterNumber || 0);
    const fallbackCourses = parseCourseCodes(defaultCurrentCourses);
    const nextCourses = (initialPlannerProfile.currentCourses?.length ? initialPlannerProfile.currentCourses : fallbackCourses).map((code) => ({
      code,
      title: code,
    }));

    setSelectedMajorSlug((current) => (current === nextMajorSlug ? current : nextMajorSlug));
    setCurrentSemesterNumber((current) => (current === nextSemesterNumber ? current : nextSemesterNumber));
    setSelectedCurrentCourses((current) => (sameSelectedCourses(current, nextCourses) ? current : nextCourses));
  }, [
    defaultCurrentCourses,
    initialPlannerProfile.currentCourses,
    initialPlannerProfile.currentSemesterNumber,
    initialPlannerProfile.majorSlug,
  ]);

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
    });
  }, [currentSemesterNumber, initialPlannerProfile.honorsStudent, onPlannerProfileChange, selectedCurrentCourses, selectedMajorSlug]);

  useEffect(() => {
    onProfileSync({
      major: selectedMajor?.name ?? defaultMajor,
      currentCourses: selectedCurrentCourses.map((course) => course.code),
    });
  }, [defaultMajor, onProfileSync, selectedCurrentCourses, selectedMajor]);

  useEffect(() => {
    if (!shouldPersistCourseSelection) return;

    onPersistProfile({
      major: selectedMajor?.name ?? defaultMajor,
      currentCourses: selectedCurrentCourses.map((course) => course.code),
      plannerProfile: {
        majorSlug: selectedMajorSlug,
        currentSemesterNumber: Number(currentSemesterNumber || "0"),
        honorsStudent: Boolean(initialPlannerProfile.honorsStudent),
        currentCourses: selectedCurrentCourses.map((course) => course.code),
      },
    });

    setShouldPersistCourseSelection(false);
  }, [
    currentSemesterNumber,
    defaultMajor,
    initialPlannerProfile.honorsStudent,
    onPersistProfile,
    selectedCurrentCourses,
    selectedMajor,
    selectedMajorSlug,
    shouldPersistCourseSelection,
  ]);

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
          completedCourses: initialPlannerProfile.completedCourses ?? [],
          catalogCode: initialPlannerProfile.auditImport?.metadata.catalogCode,
          honorsStudent: Boolean(initialPlannerProfile.honorsStudent),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not generate your plan.");
      }
      setPlan(payload.plan as PlannerResult);
      setGeneratedForKey(inputKey);
      setSettingsOpen(false);
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
    setShouldPersistCourseSelection(true);
  };

  const removeCurrentCourse = (code: string) => {
    setSelectedCurrentCourses((current) => current.filter((course) => course.code !== code));
    setShouldPersistCourseSelection(true);
  };

  const markInProgress = (slotId: string) => {
    const plannedCourse = plan?.semesters.flatMap((semester) => semester.courses).find((course) => course.slotId === slotId);

    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        semesters: current.semesters.map((semester) => ({
          ...semester,
          courses: semester.courses.map((course) =>
            course.slotId === slotId
              ? { ...course, status: "in_progress" }
              : course,
          ),
        })),
      };
    });

    if (plannedCourse) {
      setSelectedCurrentCourses((current) => dedupeCourses([...current, { code: plannedCourse.code, title: plannedCourse.title }]));
      setShouldPersistCourseSelection(true);
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
            const eligibleAlternatives = course.alternatives.filter(option => option.eligibility?.status !== "blocked");
            if (eligibleAlternatives.length < 2) return course;
            const currentIndex = eligibleAlternatives.findIndex((option) => option.code === course.code);
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % eligibleAlternatives.length : 0;
            const next = eligibleAlternatives[nextIndex];
            return {
              ...course,
              code: next.code,
              title: next.title,
              totalRegsAllTime: next.totalRegsAllTime,
              eligibility: next.eligibility,
              popularityReason: `Swapped to another approved ${course.bucketLabel.toLowerCase()} option (${next.totalRegsAllTime.toLocaleString()} registrations).`,
              status: "planned",
            };
          }),
        })),
      };
    });
  };

  const semestersByYear = useMemo(() => {
    if (!plan) return [];
    const groups = new Map<string, PlannerSemester[]>();
    plan.semesters.forEach((semester) => {
      const semesters = groups.get(semester.year) ?? [];
      semesters.push(semester);
      groups.set(semester.year, semesters);
    });
    return Array.from(groups, ([year, semesters]) => ({ year, semesters }));
  }, [plan]);

  const planStats = useMemo(() => {
    if (!plan) return { completed: 0, inProgress: 0, planned: 0, total: 0 };
    return plan.semesters.flatMap((semester) => semester.courses).reduce(
      (totals, course) => {
        const credits = course.credits ?? 0;
        if (course.countsTowardGraduation !== false) {
          totals.total += credits;
          if (course.status === "completed") totals.completed += credits;
          else if (course.status === "in_progress") totals.inProgress += credits;
          else totals.planned += credits;
        }
        return totals;
      },
      { completed: 0, inProgress: 0, planned: 0, total: 0 },
    );
  }, [plan]);

  const currentSemesterPosition = Number(currentSemesterNumber || "0");
  const activeSemesterIndex = currentSemesterPosition > 0
    ? Math.min((plan?.semesters.length ?? 1) - 1, currentSemesterPosition - 1)
    : -1;
  const activeSemester = activeSemesterIndex >= 0 ? plan?.semesters[activeSemesterIndex] ?? null : null;
  const degreeTotalHours = plan?.degreeTotalHours ?? planStats.total;
  const completedPercent = degreeTotalHours ? Math.round((planStats.completed / degreeTotalHours) * 100) : 0;

  return (
    <section className="space-y-4 text-white">
      <header className="rounded-2xl border border-white/10 bg-[#0d1627] px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-[270px] flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Degree planner</div>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="truncate text-xl font-bold tracking-[-0.03em] sm:text-2xl">{plan?.majorName || selectedMajor?.name || "Choose a major"}</h2>
              <ChevronRight className="h-4 w-4 rotate-90 text-slate-500" />
            </div>
          </div>

          <div className="hidden h-14 w-px bg-white/10 xl:block" />
          <div className="min-w-[270px] flex-1">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Degree progress</div>
                <div className="mt-1 text-2xl font-bold">{completedPercent}%</div>
              </div>
              <div className="mb-1 flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-slate-700/80">
                  <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${completedPercent}%` }} />
                </div>
                <div className="mt-1 text-center text-[11px] text-slate-400">{planStats.completed} / {degreeTotalHours || 120} credits</div>
              </div>
            </div>
          </div>

          <div className="hidden h-14 w-px bg-white/10 xl:block" />
          <div className="flex min-w-[190px] items-center gap-3">
            <CalendarDays className="h-5 w-5 text-slate-400" />
            <div>
              <div className="text-xs text-slate-400">Current semester</div>
              <div className="mt-1 font-semibold">{activeSemester?.label ?? (currentSemesterNumber === "0" ? "Not set" : `Semester ${currentSemesterNumber}`)}</div>
            </div>
          </div>

          <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#5747ff] px-5 text-sm font-semibold transition hover:bg-[#695bff]">
            <Pencil className="h-4 w-4" />
            {plan ? "Edit plan" : "Set up plan"}
          </button>
        </div>
      </header>

      {settingsOpen || !plan ? (
        <section className="rounded-2xl border border-white/10 bg-[#101829] p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Plan settings</h3>
              <p className="mt-1 text-sm text-slate-400">Choose your program and tell us what you are taking now.</p>
            </div>
            {plan ? <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button> : null}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5">
          <label className="block">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Major</div>
            <select
              value={selectedMajorSlug}
              onChange={(event) => setSelectedMajorSlug(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#0b1322] px-4 text-sm text-white outline-none"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current semester</div>
              <select
                value={currentSemesterNumber}
                onChange={(event) => setCurrentSemesterNumber(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0b1322] px-4 text-sm text-white outline-none"
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
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0b1322] px-4 text-sm text-white outline-none"
              >
                <option value="remaining">Remaining semesters</option>
                <option value="full">Full plan</option>
              </select>
            </label>
          </div>
            </div>
            <div className="lg:col-span-2">
          <CoursePicker
            label="In-progress courses"
            placeholder="Search and add courses you are taking now"
            query={currentCourseQuery}
            onQueryChange={setCurrentCourseQuery}
            results={currentCourseResults}
            selected={selectedCurrentCourses}
            onAddCourse={addCurrentCourse}
            onRemoveCourse={removeCurrentCourse}
          />
          <p className="mt-4 text-xs leading-5 text-zinc-400">
            Completed courses are loaded from <a href="/profile" className="text-indigo-300 underline">your academic profile</a>.
            {initialPlannerProfile.completedCourses?.length
              ? ` Recorded: ${initialPlannerProfile.completedCourses.join(", ")}.`
              : " None recorded yet. Year standing does not establish course completion."}
          </p>

            </div>
          </div>
          {error ? (
            <div className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={handleGenerate} disabled={loading} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#5747ff] px-5 text-sm font-semibold transition hover:bg-[#695bff] disabled:opacity-60">
              {loading ? "Generating..." : plan ? "Update roadmap" : "Generate roadmap"}
            </button>
          </div>
        </section>
      ) : null}

      {!plan ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/12 bg-[#0d1627] p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6 text-indigo-200">
                  <Target className="h-6 w-6" />
                </div>
                <div className="mt-5 text-xl font-semibold text-white">Generate a personalized roadmap</div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Choose a major, record completed classes in your profile, and add current classes here. The planner starts from a sample schedule; course eligibility still needs verification.
                </p>
              </div>
            </div>
      ) : (
        <>
          {(plan.warnings.length || plan.unscheduledRequirements.length) ? (
            <details className="rounded-xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />{plan.warnings.length + plan.unscheduledRequirements.length} items need attention <ChevronRight className="ml-auto h-4 w-4" /></summary>
              <div className="mt-3 space-y-2 border-t border-amber-300/10 pt-3 text-xs leading-5 text-amber-50/80">
                {plan.warnings.map(warning => <p key={warning}>{warning}</p>)}
                {plan.unscheduledRequirements.map(course => <p key={course.slotId}>{course.code} — {course.title} has not been assigned to a future term.</p>)}
              </div>
            </details>
          ) : null}

          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1160px] grid-cols-4 gap-2.5">
              {semestersByYear.map((group, yearIndex) => (
                <section key={group.year} className="rounded-2xl border border-white/10 bg-[#0b1424] p-2.5">
                  <div className="mb-2.5 flex items-center gap-3 px-1">
                    <div>
                      <h3 className="text-lg font-bold">Year {academicYearNumber(group.year, yearIndex)}</h3>
                      <p className="text-xs text-slate-400">{group.year}</p>
                    </div>
                    {yearIndex < semestersByYear.length - 1 ? <ArrowRight className="ml-auto h-4 w-4 text-slate-500" /> : <div className="ml-auto h-px w-12 bg-slate-600" />}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.semesters.map((semester) => {
                      const semesterIndex = plan.semesters.findIndex(item => item.id === semester.id);
                      const isCurrent = semesterIndex === activeSemesterIndex;
                      const isCompleted = semester.courses.length > 0 && semester.courses.every(course => course.status === "completed");
                      const earnedCredits = semester.courses.filter(course => course.status === "completed").reduce((sum, course) => sum + (course.credits ?? 0), 0);
                      return (
                        <article key={semester.id} className={`flex min-h-[430px] flex-col rounded-xl border p-2 ${isCurrent ? "border-violet-400 bg-violet-500/10 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]" : isCompleted ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.025]"}`}>
                          <div className="border-b border-white/8 px-1 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {isCompleted ? <Check className="h-4 w-4 rounded-full bg-emerald-300 p-0.5 text-emerald-950" /> : <Circle className={`h-4 w-4 ${isCurrent ? "fill-violet-400/20 text-violet-400" : "text-slate-500"}`} />}
                              <h4 className="text-sm font-semibold">{semester.semester}</h4>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">{semester.totalHours ? `${semester.totalHours} credits` : "Credits vary"}</p>
                            <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold ${isCurrent ? "border-violet-400/40 bg-violet-400/15 text-violet-200" : isCompleted ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>{isCurrent ? "Current" : isCompleted ? "Completed" : "Planned"}</span>
                          </div>

                          <div className="mt-2 space-y-1.5">
                            {semester.courses.map((course) => (
                              <details key={course.slotId} className={`group/course rounded-lg border ${statusClasses(course.status)}`}>
                                <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 px-2 py-1.5">
                                  {course.status === "completed" ? <Check className="h-4 w-4 shrink-0 rounded-full bg-emerald-300 p-0.5 text-emerald-950" /> : <Circle className={`h-4 w-4 shrink-0 ${course.status === "in_progress" ? "fill-sky-400/20 text-sky-300" : "text-slate-400"}`} />}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1 text-[11px] font-bold"><span>{course.code}</span><span className="flex items-center gap-1 font-medium text-slate-300">{course.eligibility?.status === "blocked" ? <span className="rounded border border-red-400/25 bg-red-500/10 px-1 text-[8px] text-red-200">Prereq</span> : course.eligibility?.status === "review" ? <span className="rounded border border-amber-400/25 bg-amber-500/10 px-1 text-[8px] text-amber-200">Check</span> : null}{course.credits ?? "—"}</span></div>
                                    <div className="truncate text-[10px] text-slate-400" title={course.title}>{course.title}</div>
                                  </div>
                                </summary>
                                <div className="space-y-2 border-t border-white/8 px-2 py-2 text-[10px] text-slate-400">
                                  <p>{course.bucketLabel}{course.popularityReason ? ` · ${course.popularityReason}` : ""}</p>
                                  {course.eligibility?.status === "blocked" ? <p className="text-red-200">Missing: {course.eligibility.missing.join(", ")}</p> : null}
                                  {course.eligibility?.status === "review" ? <p className="text-amber-200">Verify: {[...course.eligibility.missing, ...course.eligibility.unresolved].join(", ") || "catalog prerequisite wording"}</p> : null}
                                  {course.eligibility?.sourceText ? <p className="leading-4 text-slate-500">Catalog: {course.eligibility.sourceText}</p> : null}
                                  <div className="flex flex-wrap gap-1">
                                    {course.status === "planned" ? <button type="button" onClick={() => markInProgress(course.slotId)} className="rounded-md border border-emerald-400/25 px-2 py-1 font-semibold text-emerald-200 hover:bg-emerald-400/10">Taking now</button> : null}
                                    {course.kind === "elective" && course.alternatives.length > 1 ? <button type="button" onClick={() => swapElective(course.slotId)} className="rounded-md border border-white/10 px-2 py-1 font-semibold text-slate-200 hover:bg-white/5">Swap option</button> : null}
                                  </div>
                                </div>
                              </details>
                            ))}
                          </div>

                          <div className="mt-auto border-t border-white/8 px-1 pt-2">
                            <div className="flex justify-between text-[10px] text-slate-400"><span>{earnedCredits} / {semester.totalHours ?? "—"} credits</span><span>{semester.courses.filter(course => course.status === "completed").length}/{semester.courses.length}</span></div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className={`h-full rounded-full ${isCurrent ? "bg-violet-400" : "bg-emerald-300"}`} style={{ width: `${semester.totalHours ? Math.min(100, (earnedCredits / semester.totalHours) * 100) : 0}%` }} /></div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <section className="grid gap-3 rounded-2xl border border-white/10 bg-[#0d1627] p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-3 border-white/10 xl:border-r">
              <GraduationCap className="h-5 w-5 text-slate-400" />
              <div><div className="text-xs text-slate-400">Degree requirements</div><div className="mt-1 font-semibold">{planStats.completed} / {degreeTotalHours} credits</div></div>
            </div>
            <div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-emerald-300" /><div className="flex-1"><div className="flex justify-between text-xs"><span>Completed</span><span>{planStats.completed}</span></div><div className="mt-2 h-1.5 rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${completedPercent}%` }} /></div></div></div>
            <div className="flex items-center gap-3"><Layers3 className="h-5 w-5 text-sky-300" /><div className="flex-1"><div className="flex justify-between text-xs"><span>In progress</span><span>{planStats.inProgress}</span></div><div className="mt-2 h-1.5 rounded-full bg-slate-700"><div className="h-full rounded-full bg-sky-400" style={{ width: `${degreeTotalHours ? (planStats.inProgress / degreeTotalHours) * 100 : 0}%` }} /></div></div></div>
            {plan.audit ? <details className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold">View degree audit <ChevronRight className="h-4 w-4" /></summary><p className="mt-2 leading-5 text-slate-400">{plan.audit.requirements.filter(item => item.status === "reported_complete").length} complete · {plan.audit.requirements.filter(item => item.status === "missing").length} remaining</p><a href={plan.audit.source} target="_blank" rel="noreferrer" className="mt-2 inline-block text-indigo-300 underline">Catalog {plan.audit.catalogYear}</a></details> : <div className="flex items-center justify-end text-xs text-slate-500">{planStats.planned} credits planned</div>}
          </section>
        </>
      )}
    </section>
  );
}
