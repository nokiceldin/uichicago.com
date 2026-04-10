import SiteFooter from "@/app/components/SiteFooter";

const sections = [
  {
    title: "What UIChicago is built from",
    body:
      "UIChicago combines imported course history, professor review signals, course-to-professor mapping, campus knowledge content, and student workspace tools inside one product. It is student-built and unofficial, so transparency matters more here than pretending to be an official university source.",
    bullets: [
      "UIC course and grade history used in course pages and rankings",
      "Professor review and matching data used in professor pages",
      "Campus knowledge content used for planning and Sparky answers",
      "Public or imported source material transformed into student-friendly views",
    ],
  },
  {
    title: "How to read course pages",
    body:
      "Course pages are designed to help students compare difficulty, GPA patterns, withdrawal patterns, and instructor outcomes without guessing. Metrics are based on stored grade distributions and related registration history where available.",
    bullets: [
      "Average GPA is calculated from available letter-grade outcomes for the course",
      "Pass rate and withdrawal rate are shown from the visible distribution on the page",
      "Instructor comparisons are filtered to rows with enough outcomes to be worth showing",
      "Course explorer filters help narrow majors, Gen Eds, and requirement types faster",
    ],
  },
  {
    title: "How to read professor pages",
    body:
      "Professor rankings use more than a raw star score. The product weighs rating quality, review depth, and available course context so profiles with tiny samples do not look identical to profiles with stronger signals.",
    bullets: [
      "Review count matters alongside the rating itself",
      "Department rank and course rank help add local context",
      "Course matching is used so students can jump between professor and class decisions",
      "AI summaries are interpretive and should be read as guidance, not as a transcript of every review",
    ],
  },
  {
    title: "How to use Sparky well",
    body:
      "Sparky is the synthesis layer. It is best when you want the product to connect courses, professors, campus life, housing, costs, and planning into one answer. It should speed up exploration, not replace judgment for high-stakes decisions.",
    bullets: [
      "Use Sparky when you want a fast recommendation or summary",
      "Open linked course or professor pages when you want deeper evidence",
      "Treat time-sensitive, policy, and money decisions with extra caution",
      "For official deadlines, bills, and requirements, confirm against official UIC sources",
    ],
  },
  {
    title: "Limits and tradeoffs",
    body:
      "No student platform can perfectly represent every class, every instructor, or every student experience. Some courses have richer data than others. Some professors have strong review signals while others are lightly sampled or unmatched.",
    bullets: [
      "Missing or sparse data can happen on newer or lower-volume courses",
      "Professor matches are strong but not perfect in edge cases",
      "AI summaries can compress nuance",
      "The platform is unofficial and should complement, not replace, official advising or university policy pages",
    ],
  },
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-linear-to-b from-red-950/20 to-transparent" />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-white/8 dark:bg-zinc-900/50 dark:shadow-black/40 sm:p-8">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-red-500">Methodology</div>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-zinc-900 dark:text-white sm:text-5xl">
            How UIChicago works
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-zinc-600 dark:text-zinc-300">
            This page explains what the product is built from, how rankings and summaries should be read, and where students should still verify details for themselves.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              Student-built
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              Unofficial
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              Transparent about signals and limits
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/8 dark:bg-zinc-900/40"
            >
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{section.body}</p>
              <ul className="mt-4 space-y-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-500" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <SiteFooter className="mt-12" />
    </main>
  );
}
