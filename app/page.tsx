import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* subtle background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-400/10" />
        <div className="absolute left-1/2 top-[120px] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-zinc-200/40 blur-3xl dark:bg-white/5" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-10 pb-12 sm:px-6 sm:pt-16 lg:px-6 lg:pt-24">
        {/* HERO */}
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* LEFT SIDE */}
          <div className="text-center lg:text-left">
            <h1 className="mt-1 text-3xl font-semibold tracking-tight leading-tight sm:text-4xl md:text-5xl lg:text-6xl">
              Find the Best Professors & Courses at UIC
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-zinc-600 dark:text-zinc-400 sm:mt-6 sm:text-lg lg:mx-0 lg:max-w-2xl">
              Used by UIC students to pick the easiest classes, best professors
              and make the smartest schedule before registration opens.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10 sm:flex-row lg:justify-start">
              <Link
                href="/professors"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-600 sm:w-auto sm:px-8 sm:py-5 sm:text-lg"
              >
                Explore Professors →
              </Link>

              <Link
                href="/courses"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 py-4 text-base font-semibold shadow-sm transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:w-auto sm:px-8 sm:py-5 sm:text-lg"
              >
                Browse Courses →
              </Link>
            </div>

            <div className="mx-auto mt-10 grid max-w-[760px] grid-cols-1 gap-3 sm:grid-cols-3 lg:mx-0 lg:mt-12">
              <div className="rounded-2xl border border-zinc-300 bg-white px-6 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:px-8 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Courses
                </div>
                <div className="mt-1 text-2xl font-semibold text-zinc-900 sm:text-3xl dark:text-zinc-100">
                  3.4k+
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-300 bg-white px-6 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:px-8 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Instructor stats
                </div>
                <div className="mt-1 text-2xl font-semibold text-zinc-900 sm:text-3xl dark:text-zinc-100">
                  10k+
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-300 bg-white px-6 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:px-8 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Terms covered
                </div>
                <div className="mt-1 text-2xl font-semibold text-zinc-900 sm:text-3xl dark:text-zinc-100">
                  5+
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className="relative mx-auto w-full max-w-[900px]">
            <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-emerald-500/10 blur-3xl sm:-inset-8 sm:rounded-[2.5rem] dark:bg-emerald-400/10" />

            <div className="relative overflow-hidden rounded-[1.25rem] border border-zinc-200/80 bg-white/70 shadow-[0_20px_80px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:rounded-[1.75rem] dark:border-white/10 dark:bg-zinc-900/75">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent dark:from-white/5" />

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
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <div className="mt-16 grid gap-4 md:mt-20 md:grid-cols-3 md:gap-6">
          <div className="group rounded-2xl border border-zinc-200 bg-white/60 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg sm:p-6 lg:p-7 dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-white/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold sm:text-xl">
                  Professor Rankings
                </h3>
                <p className="mt-2 text-sm leading-7 text-zinc-600 sm:text-base dark:text-zinc-400">
                  See top professors by department using student ratings and
                  your difficulty score.
                </p>
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-zinc-200 bg-white/60 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg sm:p-6 lg:p-7 dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-white/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold sm:text-xl">
                  Course Difficulty
                </h3>
                <p className="mt-2 text-sm leading-7 text-zinc-600 sm:text-base dark:text-zinc-400">
                  Compare classes using GPA, grade distribution, and trend data
                  across terms.
                </p>
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-zinc-200 bg-white/60 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg sm:p-6 lg:p-7 dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-white/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold sm:text-xl">
                  Schedule Planning
                </h3>
                <p className="mt-2 text-sm leading-7 text-zinc-600 sm:text-base dark:text-zinc-400">
                  Pick better combos faster before registration opens and avoid
                  risky sections.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-24 text-center text-sm text-zinc-500 sm:mt-32 lg:mt-40 dark:text-zinc-400">
          Not affiliated with UIC or RMP.
        </div>
      </div>
    </main>
  );
}