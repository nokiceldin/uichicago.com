type ProfessorGpaRow = {
  instructorName: string;
  avgGpa: number | null;
  gradedCount: number;
  totalRegs: number;
  a: number;
  b: number;
  c: number;
  d: number;
  f: number;
  w: number;
};

function gpaPillClass(v: number | null) {
  if (v == null) {
    return "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100";
  }

  if (v >= 3.5) {
    return "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/15 dark:text-emerald-200";
  }

  if (v >= 3.0) {
    return "border-green-200 bg-green-100 text-green-700 dark:border-green-400/20 dark:bg-green-400/15 dark:text-green-200";
  }

  if (v >= 2.5) {
    return "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-400/20 dark:bg-yellow-400/15 dark:text-yellow-200";
  }

  if (v >= 2.0) {
    return "border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/15 dark:text-orange-200";
  }

  return "border-red-200 bg-red-100 text-red-700 dark:border-red-400/20 dark:bg-red-400/15 dark:text-red-200";
}

export default function CourseGpaByProfessor({
  professors,
  courseLabel,
}: {
  professors: ProfessorGpaRow[];
  courseLabel: string;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-xl">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
          {courseLabel} GPA by Professor
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Ranked from highest GPA to lowest GPA using A, B, C, D, and F outcomes only
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10">
  <div className="overflow-x-auto">
    <div className="min-w-[640px]">
      <div className="grid grid-cols-12 border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Professor</div>
          <div className="col-span-2 text-right">Avg GPA</div>
          <div className="col-span-2 text-right">Graded</div>
          <div className="col-span-3 text-right">Total regs</div>
        </div>

        <ul>
          {professors.map((row, idx) => (
            <li
              key={`${row.instructorName}-${idx}`}
              className="grid grid-cols-12 items-center border-b border-zinc-100 px-5 py-4 text-sm last:border-b-0 dark:border-white/5"
            >
              <div className="col-span-1">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
                  {idx + 1}
                </span>
              </div>

              <div className="col-span-4">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {row.instructorName}
                </div>
              </div>

              <div className="col-span-2 flex justify-end">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                    gpaPillClass(row.avgGpa),
                  ].join(" ")}
                >
                  {row.avgGpa == null ? "N/A" : row.avgGpa.toFixed(2)}
                </span>
              </div>

              <div className="col-span-2 flex justify-end">
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
                  {new Intl.NumberFormat("en-US").format(row.gradedCount)}
                </span>
              </div>

              <div className="col-span-3 flex justify-end">
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
                  {new Intl.NumberFormat("en-US").format(row.totalRegs)}
                </span>
              </div>
            </li>
          ))}

          {professors.length === 0 ? (
            <li className="px-5 py-10 text-sm text-zinc-600 dark:text-zinc-400">
              No professor GPA data available for this course.
            </li>
          ) : null}
        </ul>
      </div>
      </div>
      </div>
    </section>
  );
}