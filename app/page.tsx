import Link from "next/link";
import Image from "next/image";
import HeroSearch from "./components/HeroSearch";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.025] dark:opacity-[0.02]" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <section className="pt-6 pb-16 sm:pt-10 sm:pb-20 lg:pt-12">
          <div className="flex justify-center mb-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              UIC Students Only
            </span>
          </div>

          <h1 className="mx-auto max-w-4xl text-center text-5xl font-black leading-[1.08] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
            <span className="block text-zinc-900 dark:text-white">Find the best</span>
            <span className="block bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 bg-clip-text text-transparent">professors & classes</span>
            <span className="block text-zinc-900 dark:text-white">at UIC.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-center text-base leading-8 text-zinc-500 dark:text-zinc-400 sm:text-lg">
            Real grade data, professor ratings, and difficulty scores — so you pick the smartest schedule before registration opens.
          </p>

          <div className="mx-auto mt-10 max-w-xl">
            <HeroSearch />
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/courses" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:-translate-y-0.5 sm:w-auto">
              Browse Courses →
            </Link>
            <Link href="/professors" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-8 py-4 text-base font-bold text-zinc-900 shadow-sm transition-all hover:bg-zinc-50 hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 sm:w-auto">
              Explore Professors →
            </Link>
          </div>

          <div className="mx-auto mt-14 flex flex-wrap items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-white/8 dark:bg-white/5">
            {[
              { label: "Courses indexed", value: "3.4k+" },
              { label: "Instructor stats", value: "10k+" },
              { label: "Terms covered", value: "5+" },
              { label: "Students helped", value: "Free" },
            ].map((s) => (
              <div key={s.label} className="flex flex-1 min-w-[120px] flex-col items-center py-5 px-6 border-r border-zinc-200 dark:border-white/8 last:border-r-0">
                <span className="text-2xl font-black text-zinc-900 dark:text-white sm:text-3xl">{s.value}</span>
                <span className="mt-1 text-xs text-zinc-500 tracking-wide">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="relative pb-24 sm:pb-32">
          <div className="relative mx-auto max-w-5xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-white/8" />
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Live preview</span>
              <span className="h-px flex-1 bg-zinc-200 dark:bg-white/8" />
            </div>
            <div className="relative overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-2xl shadow-zinc-100 dark:border-white/10 dark:bg-zinc-900/80 dark:shadow-black/60">
              <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-5 py-3.5 dark:border-white/8 dark:bg-zinc-900/90">
                <span className="h-3 w-3 rounded-full bg-red-400/80" />
                <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                <span className="mx-auto rounded-md bg-zinc-100 dark:bg-white/5 px-8 py-1 text-xs text-zinc-400 dark:text-zinc-500">uicratings.com</span>
              </div>
              <Image src="/hero-course-light.png" alt="UIC Ratings course analytics preview" width={2200} height={1400} priority className="h-auto w-full object-cover dark:hidden" />
              <Image src="/hero-course-dark.png" alt="UIC Ratings course analytics preview" width={2200} height={1400} priority className="hidden h-auto w-full object-cover dark:block" />
            </div>
          </div>
        </section>

        <section className="pb-24 sm:pb-32">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-black text-zinc-900 dark:text-white sm:text-4xl">
              Everything you need to <span className="text-emerald-500 dark:text-emerald-400">schedule smarter</span>
            </h2>
            <p className="mt-3 text-zinc-500">No more guessing. Real data, real decisions.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: "🏆", title: "Professor Rankings", desc: "See top-rated professors by department using real student ratings and difficulty scores — sorted the way you care about.", light: "from-emerald-50 to-teal-50 border-emerald-100 hover:border-emerald-200", dark: "dark:from-emerald-500/10 dark:to-teal-500/5 dark:border-white/8 dark:hover:border-emerald-500/30" },
              { icon: "📊", title: "Course Difficulty", desc: "Compare classes using GPA distributions, grade curves, and multi-term trend data to spot easy A's before everyone else does.", light: "from-sky-50 to-blue-50 border-sky-100 hover:border-sky-200", dark: "dark:from-sky-500/10 dark:to-blue-500/5 dark:border-white/8 dark:hover:border-sky-500/30" },
              { icon: "🗓️", title: "Schedule Planning", desc: "Build smarter combos before registration opens. Avoid notoriously hard sections and professors that tank your GPA.", light: "from-violet-50 to-purple-50 border-violet-100 hover:border-violet-200", dark: "dark:from-violet-500/10 dark:to-purple-500/5 dark:border-white/8 dark:hover:border-violet-500/30" },
            ].map((f) => (
              <div key={f.title} className={`rounded-2xl border bg-gradient-to-br p-6 transition-all hover:-translate-y-1 hover:shadow-lg sm:p-7 ${f.light} ${f.dark}`}>
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">{f.title}</h3>
                <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-24 overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-10 text-center dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-teal-500/5 dark:to-transparent sm:mb-32 sm:p-16">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Ready?</p>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white sm:text-5xl">Stop guessing. Start winning.</h2>
          <p className="mx-auto mt-4 max-w-lg text-zinc-500 dark:text-zinc-400">Join thousands of UIC students who plan smarter every semester. It&apos;s free, always.</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/courses" className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:-translate-y-0.5">Browse Courses →</Link>
            <Link href="/professors" className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-8 py-4 text-base font-bold text-zinc-900 transition hover:bg-zinc-50 hover:-translate-y-0.5 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">Explore Professors →</Link>
          </div>
        </section>

        <footer className="border-t border-zinc-100 dark:border-white/8 py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">
          <p>Contact: <a href="mailto:uicratings@gmail.com" className="transition hover:text-emerald-500 dark:hover:text-emerald-400">uicratings@gmail.com</a></p>
          <p className="mt-1">Not affiliated with UIC or RMP.</p>
        </footer>
      </div>
    </main>
  );
}