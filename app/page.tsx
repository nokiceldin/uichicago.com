import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* subtle background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-400/10" />
        <div className="absolute left-1/2 top-[120px] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-zinc-200/40 blur-3xl dark:bg-white/5" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-32">
        {/* HERO */}
        <div className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/60 px-3 py-1 text-xs text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Updated with course stats and ratings
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
            Find the Best Professors & Courses at UIC
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Search professors and courses using real student ratings plus grade distribution data so you can build a smarter schedule.
          </p>

          {/* quick actions */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">

  <Link
    href="/professors"
    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-10 py-6 text-lg font-semibold shadow-sm transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:w-auto"
  >
    Explore Professors →
  </Link>

  <Link
    href="/courses"
    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-10 py-6 text-lg font-semibold shadow-sm transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:w-auto"
  >
    Browse Courses →
  </Link>

</div>

          {/* stats */}
          <div className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">

  <div className="rounded-2xl border border-zinc-300 bg-white px-10 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5">
    <div className="text-sm text-zinc-600 dark:text-zinc-400">
      Courses
    </div>
    <div className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
      3.4k+
    </div>
  </div>

  <div className="rounded-2xl border border-zinc-300 bg-white px-10 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5">
    <div className="text-sm text-zinc-600 dark:text-zinc-400">
      Instructor stats
    </div>
    <div className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
      10k+
    </div>
  </div>

  <div className="rounded-2xl border border-zinc-300 bg-white px-10 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5">
    <div className="text-sm text-zinc-600 dark:text-zinc-400">
      Terms covered
    </div>
    <div className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
      5+
    </div>
  </div>

</div>
        </div>

        {/* FEATURES */}
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          <div className="group rounded-2xl border border-zinc-200 p-7 transition hover:-translate-y-1 hover:shadow-lg bg-white/60 p-7 backdrop-blur transition hover:-translate-y-0.5 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-white/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Professor Rankings</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  See top professors by department using student ratings and your difficulty score.
                </p>
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-zinc-200 p-7 transition hover:-translate-y-1 hover:shadow-lg bg-white/60 p-7 backdrop-blur transition hover:-translate-y-0.5 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-white/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Course Difficulty</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Compare classes using GPA, grade distribution, and trend data across terms.
                </p>
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-zinc-200 p-7 transition hover:-translate-y-1 hover:shadow-lg bg-white/60 p-7 backdrop-blur transition hover:-translate-y-0.5 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-white/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Schedule Planning</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Pick better combos faster before registration opens and avoid risky sections.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Independent student built project. Not affiliated with UIC or RateMyProfessor.
        </div>
      </div>
    </main>
  )
}