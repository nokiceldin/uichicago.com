"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type DistItem = { label: string; value: number; color: string; };
type GradeDistributionCardProps = { avgGpa: number | null; distribution: DistItem[]; visualTotal: number; totalRegs: number; other: number; };

export default function GradeDistributionCard({ avgGpa, distribution, visualTotal, totalRegs, other }: GradeDistributionCardProps) {
  const chartData = distribution.filter((item) => item.value > 0);
  const nf = new Intl.NumberFormat("en-US");

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-white/8 dark:bg-zinc-900/40 sm:p-6 dark:shadow-xl">
      <div className="mb-5 sm:mb-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">Grade Distribution</h2>
        <p className="mt-1 text-sm text-zinc-500">Based on all available term-level grade data for this course</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="h-[300px] sm:h-[320px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e4e4e7", borderRadius: "12px", fontSize: "12px", color: "#18181b" }}
                  formatter={(value, name) => {
                    const num = typeof value === "number" ? value : Number(value ?? 0);
                    const pct = visualTotal > 0 ? ((num / visualTotal) * 100).toFixed(1) : "0.0";
                    return [`${num} students · ${pct}%`, String(name)];
                  }}
                />
                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={80} outerRadius={120} paddingAngle={2} strokeWidth={0}>
                  {chartData.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 text-sm text-zinc-400 dark:text-zinc-600">No grade distribution data available</div>
          )}
          <div className="pointer-events-none -mt-[185px] sm:-mt-[205px] flex justify-center">
            <div className="flex h-[110px] w-[110px] sm:h-[124px] sm:w-[124px] flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-950/90 text-center ring-1 ring-zinc-200 dark:ring-white/10 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Avg GPA</div>
              <div className="mt-1 text-2xl font-black text-zinc-900 dark:text-white">{avgGpa == null ? "N/A" : avgGpa.toFixed(2)}</div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {distribution.map((item) => {
              const pct = visualTotal > 0 ? ((item.value / visualTotal) * 100).toFixed(1) : "0.0";
              return (
                <div key={item.label} className="flex items-center justify-between rounded-xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-2.5 ring-1 ring-zinc-200 dark:ring-white/8">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-300">{item.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-200 tabular-nums">{pct}%</div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">{item.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Visual total", value: nf.format(visualTotal) },
              { label: "Other", value: nf.format(other) },
              { label: "Total regs", value: nf.format(totalRegs) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-3 ring-1 ring-zinc-200 dark:ring-white/8 text-center">
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">{s.label}</div>
                <div className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-300 tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}