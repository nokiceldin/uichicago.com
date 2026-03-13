type ProfessorGpaRow = { instructorName: string; avgGpa: number | null; gradedCount: number; totalRegs: number; a: number; b: number; c: number; d: number; f: number; w: number; };

function gpaConfig(v: number | null) {
  if (v == null) return { text: "text-zinc-600 dark:text-zinc-400", bg: "bg-zinc-100 dark:bg-white/5", ring: "ring-zinc-200 dark:ring-white/10" };
  if (v >= 3.5) return { text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/15", ring: "ring-emerald-200 dark:ring-emerald-500/25" };
  if (v >= 3.0) return { text: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-500/15", ring: "ring-green-200 dark:ring-green-500/25" };
  if (v >= 2.5) return { text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/15", ring: "ring-amber-200 dark:ring-amber-500/25" };
  if (v >= 2.0) return { text: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/15", ring: "ring-orange-200 dark:ring-orange-500/25" };
  return { text: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/15", ring: "ring-red-200 dark:ring-red-500/25" };
}

const nf = new Intl.NumberFormat("en-US");

export default function CourseGpaByProfessor({ professors = [], courseLabel }: { professors: ProfessorGpaRow[]; courseLabel: string; }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/40 dark:shadow-xl">
      <div className="px-5 py-5 sm:px-6 border-b border-zinc-100 dark:border-white/8">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">
          {courseLabel} <span className="text-zinc-400 dark:text-zinc-500 font-medium">by Professor</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Ranked highest to lowest GPA — using A, B, C, D, and F outcomes only</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[580px]">
          <div className="grid grid-cols-12 bg-zinc-50 dark:bg-zinc-950/50 px-5 sm:px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Professor</div>
            <div className="col-span-2 text-right">Avg GPA</div>
            <div className="col-span-2 text-right">Graded</div>
            <div className="col-span-2 text-right">Total regs</div>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
            {professors.map((row, idx) => {
              const gc = gpaConfig(row.avgGpa);
              return (
                <li key={`${row.instructorName}-${idx}`} className="grid grid-cols-12 items-center px-5 sm:px-6 py-4 text-sm hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <div className="col-span-1">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 dark:bg-white/5 text-xs font-bold text-zinc-500 dark:text-zinc-500 ring-1 ring-zinc-200 dark:ring-white/8">{idx + 1}</span>
                  </div>
                  <div className="col-span-5">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-200">{row.instructorName}</span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ring-1 ${gc.bg} ${gc.text} ${gc.ring}`}>
                      {row.avgGpa == null ? "N/A" : row.avgGpa.toFixed(2)}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className="tabular-nums text-sm text-zinc-600 dark:text-zinc-400">{nf.format(row.gradedCount)}</span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className="tabular-nums text-sm text-zinc-400 dark:text-zinc-500">{nf.format(row.totalRegs)}</span>
                  </div>
                </li>
              );
            })}
            {professors.length === 0 && <li className="px-6 py-12 text-center text-sm text-zinc-400 dark:text-zinc-600">No professor GPA data available for this course.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}