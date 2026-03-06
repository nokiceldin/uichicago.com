"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type DistItem = {
  label: string;
  value: number;
  color: string;
};

type GradeDistributionCardProps = {
  avgGpa: number | null;
  distribution: DistItem[];
  visualTotal: number;
  totalRegs: number;
  other: number;
};

export default function GradeDistributionCard({
  avgGpa,
  distribution,
  visualTotal,
  totalRegs,
  other,
}: GradeDistributionCardProps) {
  const chartData = distribution.filter((item) => item.value > 0);

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-xl dark:backdrop-blur">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
          Grade Distribution
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Based on all available term level grade data for this course
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="h-[340px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  formatter={(value, name) => {
                    const num =
                      typeof value === "number" ? value : Number(value ?? 0);
                    const pct =
                      visualTotal > 0
                        ? ((num / visualTotal) * 100).toFixed(1)
                        : "0.0";

                    return [`${num} students • ${pct}%`, String(name)];
                  }}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={88}
                  outerRadius={128}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              No grade distribution data available
            </div>
          )}

          <div className="pointer-events-none -mt-[205px] flex justify-center">
            <div className="flex h-[120px] w-[120px] flex-col items-center justify-center rounded-full bg-white/90 text-center shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950/90 dark:ring-white/10">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Avg GPA
              </div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {avgGpa == null ? "N/A" : avgGpa.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="space-y-3">
              {distribution.map((item) => {
                const pct =
                  visualTotal > 0
                    ? ((item.value / visualTotal) * 100).toFixed(1)
                    : "0.0";

                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-zinc-200 dark:bg-zinc-950/40 dark:ring-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.label}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {pct}%
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.value} students
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-950/40">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Visual total
                </div>
                <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {visualTotal}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-950/40">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Other outcomes
                </div>
                <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {other}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-950/40">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Total regs
                </div>
                <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {totalRegs}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}