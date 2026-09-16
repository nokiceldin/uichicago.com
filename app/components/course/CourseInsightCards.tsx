import type { CourseOutcomeSummary } from "@/lib/courses/outcome-summary";

type CourseInsightCardsProps = {
  avgGpa: number | null;
  difficultyScore: number | null;
  outcomeSummary: CourseOutcomeSummary;
};

function gpaColor(v: number | null) {
  if (v == null) return "text-zinc-500";
  if (v >= 3.5) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 3.0) return "text-green-600 dark:text-green-400";
  if (v >= 2.5) return "text-amber-600 dark:text-amber-400";
  if (v >= 2.0) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function easinessColor(v: number | null) {
  if (v == null) return "text-zinc-500";
  if (v >= 4.5) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 4.0) return "text-green-600 dark:text-green-400";
  if (v >= 3.0) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function StatCard({ label, value, valueClass = "text-zinc-900 dark:text-white", helper }: { label: string; value: string; valueClass?: string; helper?: string; }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm dark:border-white/8 dark:bg-zinc-900/40 sm:px-5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">{label}</div>
      <div className={`mt-2 text-2xl font-black tabular-nums sm:text-3xl ${valueClass}`}>{value}</div>
      {helper && <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-600">{helper}</div>}
    </div>
  );
}

function rate(value: number | null) {
  return value == null ? "N/A" : `${value.toFixed(1)}%`;
}

export default function CourseInsightCards({ avgGpa, difficultyScore, outcomeSummary }: CourseInsightCardsProps) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">Quick Insights</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Avg GPA" value={avgGpa == null ? "N/A" : avgGpa.toFixed(2)} valueClass={gpaColor(avgGpa)} />
        <StatCard label="Easiness" value={difficultyScore == null ? "N/A" : difficultyScore.toFixed(2)} valueClass={easinessColor(difficultyScore)} />
        <StatCard label="C or better" value={rate(outcomeSummary.cOrBetterRate)} helper="Among A–F outcomes" />
        <StatCard label="D or better" value={rate(outcomeSummary.dOrBetterRate)} helper="Among A–F outcomes" />
        <StatCard label="Withdrawal rate" value={rate(outcomeSummary.withdrawalRate)} helper="Among A–F and W outcomes" />
        <StatCard label="Most common grade" value={outcomeSummary.mostCommonLetterGrade ?? "N/A"} helper="Letter grades only" />
        <StatCard label="Outcomes counted" value={new Intl.NumberFormat("en-US").format(outcomeSummary.visibleOutcomeTotal)} helper="A–F and W outcomes" />
      </div>
    </section>
  );
}
