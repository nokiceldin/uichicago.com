type CourseHeaderProps = {
  course: {
    subject: string;
    number: string;
    title: string | null;
    deptName: string | null;
    avgGpa: number | null;
    difficultyScore: number | null;
    totalRegsAllTime: number | null;
    isGenEd: boolean;
    genEdCategory: string | null;
  };
};

function statPill(label: string, value: string) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-zinc-900/40">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

export default function CourseHeader({ course }: CourseHeaderProps) {
  const totalRegs = course.totalRegsAllTime ?? 0;

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white/70 p-6 shadow-lg backdrop-blur dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              {course.subject} {course.number}
            </span>

            {course.isGenEd ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                Gen Ed
              </span>
            ) : null}

            {course.isGenEd && course.genEdCategory ? (
              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                {course.genEdCategory}
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
            {course.title || `${course.subject} ${course.number}`}
          </h1>

          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {course.deptName || "Department not available"}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[420px]">
          {statPill(
            "Avg GPA",
            course.avgGpa == null ? "No data" : course.avgGpa.toFixed(2)
          )}
          {statPill(
            "Easiness",
            course.difficultyScore == null
              ? "No data"
              : course.difficultyScore.toFixed(2)
          )}
          {statPill(
            "Total regs",
            new Intl.NumberFormat("en-US").format(totalRegs)
          )}
        </div>
      </div>
    </section>
  );
}