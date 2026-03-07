type CourseInsightCardsProps = {
  avgGpa: number | null;
  difficultyScore: number | null;
  totalRegs: number;
  visualTotal: number;
  passRate: number;
  withdrawalRate: number;
  mostCommonGrade: string;
};

function card(label: string, value: string, helper?: string) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/40">
      <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      {helper ? (
        <div className="mt-1 text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

export default function CourseInsightCards({
  avgGpa,
  difficultyScore,
  totalRegs,
  visualTotal,
  passRate,
  withdrawalRate,
  mostCommonGrade,
}: CourseInsightCardsProps) {
  return (
    <section>
      <h2 className="mb-4 text-xl sm:text-2xl font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
        Quick Insights
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
        {card(
          "Avg GPA",
          avgGpa == null ? "N/A" : avgGpa.toFixed(2)
        )}

        {card(
          "Easiness",
          difficultyScore == null ? "N/A" : difficultyScore.toFixed(2)
        )}

        {card(
          "Pass rate",
          `${passRate.toFixed(1)}%`,
          "Using A, B, C, D as passing"
        )}

        {card(
          "Withdrawal rate",
          `${withdrawalRate.toFixed(1)}%`,
          "Based on visible distribution"
        )}

        {card(
          "Most common grade",
          mostCommonGrade
        )}

        {card(
          "Students counted",
          new Intl.NumberFormat("en-US").format(visualTotal || totalRegs),
          visualTotal > 0 ? "A through F plus W" : "Using total registrations"
        )}
      </div>
    </section>
  );
}