import Link from "next/link"
import Image from "next/image";

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
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* LEFT SIDE */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/60 px-3 py-1 text-xs text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Updated with course stats and ratings
            </div>

            <h1 className="mt-1 text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
              Find the Best Professors & Courses at UIC
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400 lg:mx-0">
Find the best professors, easiest classes, and smartest schedule before registration opens.            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
              <Link
                href="/professors"
className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-10 py-6 text-lg font-semibold text-white shadow-sm transition hover:bg-emerald-600 sm:w-auto"              >
                Explore Professors →
              </Link>

              <Link
                href="/courses"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-10 py-6 text-lg font-semibold shadow-sm transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:w-auto"
              >
                Browse Courses →
              </Link>
            </div>

            <div className="mx-auto mt-12 grid max-w-[760px] gap-3 sm:grid-cols-3 lg:mx-0">
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

          {/* RIGHT SIDE */}
          <div className="relative mx-auto w-full max-w-[900px]">
            <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-emerald-500/10 blur-3xl dark:bg-emerald-400/10" />

            <div className="relative overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white/80 shadow-2xl dark:border-white/10 dark:bg-zinc-900/80">
              <div className="border-b border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Live course analytics
              </div>

              <>
  <Image
    src="/hero-course-light.png"
    alt="UIC Ratings course analytics preview"
    width={2200}
    height={1400}
    priority
    className="h-auto w-full object-cover dark:hidden"
  />

  <Image
    src="/hero-course-dark.png"
    alt="UIC Ratings course analytics preview"
    width={2200}
    height={1400}
    priority
    className="hidden h-auto w-full object-cover dark:block"
  />
</>
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <div className="mt-20 grid gap-6 md:grid-cols-3">
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
          Not affiliated with UIC or RMP.</div>
      </div>
    </main>
  )
}