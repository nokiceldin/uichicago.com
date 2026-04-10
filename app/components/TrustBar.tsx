import Link from "next/link";

type TrustBarProps = {
  eyebrow?: string;
  summary: string;
  bullets: string[];
  className?: string;
};

export default function TrustBar({
  eyebrow = "Trust",
  summary,
  bullets,
  className = "",
}: TrustBarProps) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/4 ${className}`.trim()}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">{eyebrow}</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">{summary}</p>
        </div>
        <Link
          href="/methodology"
          className="inline-flex shrink-0 items-center rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          See methodology →
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {bullets.map((bullet) => (
          <span
            key={bullet}
            className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
          >
            {bullet}
          </span>
        ))}
      </div>
    </section>
  );
}
