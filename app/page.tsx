import Link from "next/link";
import HeroSearchBar from "./components/HeroSearchBar";
import DeepPageShowcase from "./components/DeepPageShowcase";
import SparkyShowcase from "./components/SparkyShowcase";

const productPillars = [
  {
    eyebrow: "Courses",
    title: "Find the right classes before registration opens",
    description:
      "Browse grade distributions, easiness, average GPA, pass rates, and requirement filters without guessing.",
    href: "/courses",
    accent: "from-emerald-500/25 via-emerald-500/10 to-transparent",
    border: "hover:border-emerald-400/50",
  },
  {
    eyebrow: "Professors",
    title: "Compare instructors with real ratings and actual class data",
    description:
      "Search by department, ratings, reviews, and past class history to choose better sections faster.",
    href: "/professors",
    accent: "from-sky-500/25 via-sky-500/10 to-transparent",
    border: "hover:border-sky-400/50",
  },
  {
    eyebrow: "Sparky AI",
    title: "Ask one question and get the full picture",
    description:
      "Use Sparky for plans, comparisons, campus questions, and quick recommendations when browsing alone is not enough.",
    href: "/chat",
    accent: "from-red-500/25 via-red-500/10 to-transparent",
    border: "hover:border-red-400/50",
  },
  {
    eyebrow: "Study Mode",
    title: "Enter a dedicated workspace for flashcards, quizzes, and exam practice",
    description:
      "Switch into a more focused study space with decks, notes, practice modes, and progress tracking built in.",
    href: "/study",
    accent: "from-indigo-500/25 via-indigo-500/10 to-transparent",
    border: "hover:border-indigo-400/50",
  },
];

const proofStats = [
  { value: "2,696", label: "courses indexed" },
  { value: "1,275", label: "professors tracked" },
  { value: "460+", label: "student orgs mapped" },
];

const launchTiles = [
  {
    title: "Course Explorer",
    meta: "Live now",
    href: "/courses",
    summary:
      "Search by course code or title, then sort by easiness, GPA, gen-ed fit, and requirement type.",
    bullets: ["Real grade distributions", "Major + Gen-Ed filtering", "Course detail pages"],
  },
  {
    title: "Professor Rankings",
    meta: "Live now",
    href: "/professors",
    summary:
      "See which professors students rate highest, which departments are strongest, and who has taught key classes before.",
    bullets: ["RMP-driven rankings", "Department filters", "Past class history"],
  },
  {
    title: "Sparky Chat",
    meta: "Live now",
    href: "/chat",
    summary:
      "Ask direct questions when you want recommendations, comparisons, campus answers, or quick decision help.",
    bullets: ["Course and professor Q&A", "Campus-life questions", "Schedule and planning help"],
  },
  {
    title: "Study Mode",
    meta: "Live now",
    href: "/study",
    summary:
      "Step into a dedicated study workspace for flashcards, learn mode, timed practice, notes, and AI-generated material.",
    bullets: ["Flashcards + Learn mode", "Test + exam practice", "AI generation + progress tracking"],
  },
];

function getLaunchBadgeClasses(meta: string): string {
  if (meta === "Live now") {
    return "border-emerald-500/30 bg-emerald-500/12 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]";
  }

  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-950 dark:bg-black dark:text-white">
      <section className="relative overflow-hidden border-b border-zinc-200/80 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.18),transparent_26%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.12),transparent_22%),linear-gradient(180deg,#0d0d10_0%,#120809_52%,#09090b_100%)] px-6 pb-20 pt-20 text-white dark:border-white/10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:42px_42px] opacity-[0.07]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-red-200">
                UIChicago
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Student platform
              </div>

              <h1 className="max-w-4xl text-5xl font-black tracking-[-0.05em] text-white md:text-7xl">
                The map for figuring out
                <span className="block bg-gradient-to-r from-white via-red-200 to-red-500 bg-clip-text text-transparent">
                  all of UIC.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300 md:text-xl">
                Explore courses, compare professors, ask Sparky for guidance, and switch into a dedicated study mode when it is time to prepare.
                <span className="text-zinc-100"> UIChicago is the platform. Sparky is the AI inside it.</span>
              </p>

              <div className="mt-10">
                <HeroSearchBar />
              </div>

              <div className="mt-8 flex flex-wrap gap-3 text-sm">
                <Link
                  href="/courses"
                  className="premium-button group inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-5 py-3 font-semibold text-zinc-50 shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition hover:border-emerald-400/45 hover:bg-[linear-gradient(180deg,rgba(16,185,129,0.16),rgba(255,255,255,0.06))] hover:shadow-[0_16px_38px_rgba(16,185,129,0.12)]"
                >
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.55)]" />
                  Browse courses
                  <span className="text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-100">→</span>
                </Link>
                <Link
                  href="/professors"
                  className="premium-button group inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-5 py-3 font-semibold text-zinc-50 shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition hover:border-sky-400/45 hover:bg-[linear-gradient(180deg,rgba(56,189,248,0.16),rgba(255,255,255,0.06))] hover:shadow-[0_16px_38px_rgba(56,189,248,0.12)]"
                >
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.55)]" />
                  Explore professors
                  <span className="text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-100">→</span>
                </Link>
                <Link
                  href="/chat"
                  className="premium-button group inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-[linear-gradient(180deg,rgba(239,68,68,0.22),rgba(127,29,29,0.18))] px-5 py-3 font-semibold text-red-50 shadow-[0_12px_32px_rgba(239,68,68,0.16)] transition hover:border-red-300/60 hover:bg-[linear-gradient(180deg,rgba(239,68,68,0.32),rgba(127,29,29,0.22))] hover:shadow-[0_18px_40px_rgba(239,68,68,0.2)]"
                >
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.58)]" />
                  Open Sparky
                  <span className="text-red-200 transition group-hover:translate-x-0.5 group-hover:text-white">→</span>
                </Link>
              </div>
            </div>

            <div className="relative lg:-mr-4">
              <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-red-500/20 via-transparent to-sky-500/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl lg:p-7">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.12),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(56,189,248,0.08),transparent_26%)]" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-400">UIC Snapshot</div>
                      <div className="mt-3 max-w-[11ch] text-[2.35rem] font-black leading-[0.98] tracking-[-0.055em] text-white">
                        What students actually need
                      </div>
                    </div>

                    <div className="min-w-[15rem] rounded-[1.6rem] border border-red-400/25 bg-[linear-gradient(180deg,rgba(239,68,68,0.16),rgba(127,29,29,0.10))] p-4 shadow-[0_14px_34px_rgba(239,68,68,0.14)]">
                      <div className="text-right text-[10px] font-bold uppercase tracking-[0.24em] text-red-300">Live layer</div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold text-white">
                          Courses
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold text-white">
                          Professors
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold text-white">
                          Study Mode
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold text-white">
                          Sparky
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 h-px w-full bg-gradient-to-r from-white/15 via-white/10 to-transparent" />

                  <div className="mt-6 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      {[
                        ["Search fast", "Browse structured data first"],
                        ["Ask Sparky", "Get quick synthesis when needed"],
                      ].map(([title, body]) => (
                        <div
                          key={title}
                          className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                        >
                          <div className="text-sm font-semibold text-white">{title}</div>
                          <div className="mt-1.5 text-sm leading-6 text-zinc-400">{body}</div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
                      <p className="text-lg leading-8 text-zinc-200">
                        UIChicago brings course data, professor rankings, a dedicated study mode, and campus answers into one place.
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2.5">
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                          Course data
                        </span>
                        <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
                          Professor rankings
                        </span>
                        <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200">
                          Study mode
                        </span>
                        <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200">
                          Sparky AI
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white px-6 py-7 dark:border-white/10 dark:bg-zinc-950">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-y-5 md:grid-cols-3">
          {proofStats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
                {stat.value}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-red-500">Three ways in</div>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white md:text-5xl">
              Start with data, then use AI when you need it.
            </h2>
            <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              This is not just a chatbot. It is a UIC platform with search, rankings, browsing, and AI layered on top.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {productPillars.map((pillar) => (
              <Link
                key={pillar.title}
                href={pillar.href}
                style={{ animationDelay: `${40 * (productPillars.indexOf(pillar) + 1)}ms` }}
                className={`premium-card premium-fade-up group relative flex min-h-[320px] flex-col overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-6 transition duration-300 hover:shadow-2xl dark:border-white/10 dark:bg-zinc-950 ${pillar.border}`}
              >
                <div className={`absolute inset-x-0 top-0 h-40 bg-gradient-to-b ${pillar.accent}`} />
                <div className="relative">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                    {pillar.eyebrow}
                  </div>
                  <h3 className="mt-4 max-w-[14ch] text-[1.9rem] leading-[1.05] font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
                    {pillar.title}
                  </h3>
                  <p className="mt-4 max-w-[28ch] text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                    {pillar.description}
                  </p>
                  <div className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-zinc-950 transition group-hover:gap-3 dark:text-white">
                    Open
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                  <div className="mt-6 h-px w-full bg-gradient-to-r from-zinc-300/70 to-transparent dark:from-white/10" />
                  <div className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    {pillar.eyebrow === "Courses"
                      ? "Structured data"
                      : pillar.eyebrow === "Professors"
                      ? "Real comparisons"
                      : pillar.eyebrow === "Sparky AI"
                      ? "Fast synthesis"
                      : "Active recall"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-red-500">Deep Pages</div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white md:text-4xl">
              Go deeper than search results.
            </h2>
            <p className="mt-3 text-base leading-8 text-zinc-600 dark:text-zinc-400">
              Open real course and professor pages, not just list views.
            </p>
          </div>

          <DeepPageShowcase />
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-zinc-200 bg-zinc-50 px-6 py-20 dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.08),transparent_20%),radial-gradient(circle_at_85%_15%,rgba(59,130,246,0.06),transparent_22%),linear-gradient(180deg,#0d0f14_0%,#0a0b0f_100%)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">Platform map</div>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white md:text-5xl">
              What lives inside UIChicago
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              A cleaner story for the product: browse structured pages when you want control, and jump into Sparky when you want synthesis.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {launchTiles.map((tile) => (
              <Link
                key={tile.title}
                href={tile.href}
                style={{ animationDelay: `${45 * (launchTiles.indexOf(tile) + 1)}ms` }}
                className="premium-card premium-fade-up rounded-[1.5rem] border border-zinc-200 bg-white p-6 transition hover:border-red-400/40 hover:shadow-xl dark:border-white/10 dark:bg-[rgba(15,17,22,0.82)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 pr-2 text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white">
                    {tile.title}
                  </h3>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${getLaunchBadgeClasses(tile.meta)}`}
                  >
                    {tile.meta}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                  {tile.summary}
                </p>
                <div className="mt-5 space-y-2">
                  {tile.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {bullet}
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <SparkyShowcase />
      </section>

      <footer className="border-t border-zinc-200 px-6 py-8 text-sm dark:border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-zinc-500 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-500">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">UIChicago</span> by Sparky Labs
          </div>
          <div className="text-sm text-zinc-500 md:text-center">
            Powered by real course, professor, and campus data
          </div>
          <div className="flex flex-col items-center gap-1 text-center md:items-end md:text-right">
            <a
              href="mailto:uicratings@gmail.com"
              className="text-sm font-medium text-zinc-600 transition hover:text-red-500 dark:text-zinc-300 dark:hover:text-red-300"
            >
              uicratings@gmail.com
            </a>
            <div className="text-[11px] tracking-[0.12em] text-zinc-500/90">Unofficial and not affiliated with UIC</div>
          </div>
        </div>
      </footer>
    </main>
  );
}
