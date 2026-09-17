import SiteFooter from "@/app/components/SiteFooter";

const courseMetrics = [
  ["Average GPA", "Calculated from the available A–F letter grades."],
  ["C or better", "A, B, and C divided by all A–F outcomes."],
  ["D or better", "A through D divided by all A–F outcomes."],
  ["Withdrawal rate", "W divided by A–F plus W outcomes."],
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
        <header className="border-b border-zinc-200 pb-10 dark:border-white/10 sm:pb-14">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-red-500">Methodology</div>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-end lg:gap-16">
            <div>
              <h1 className="max-w-3xl text-5xl font-black tracking-[-0.055em] text-zinc-950 dark:text-white sm:text-6xl">
                The short version.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                UIChicago turns course history, professor signals, and campus information into tools that are easier to use.
              </p>
            </div>
            <p className="border-l-2 border-red-500 pl-4 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Student-built and unofficial. We show missing data instead of filling the gaps with guesses.
            </p>
          </div>
        </header>

        <div className="divide-y divide-zinc-200 dark:divide-white/10">
          <section className="grid gap-5 py-10 sm:py-14 md:grid-cols-[5rem_1fr]">
            <div className="text-sm font-bold tracking-[0.2em] text-red-500">01</div>
            <div>
              <h2 className="text-3xl font-bold tracking-[-0.035em] text-zinc-950 dark:text-white">Where the information comes from</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
                We combine imported UIC course and grade history, professor reviews and matches, plus public campus information used by Sparky.
              </p>
              <div className="mt-7 grid border-y border-zinc-200 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300 sm:grid-cols-2">
                {["Course and grade history", "Professor reviews", "Course–instructor matches", "Campus reference material"].map((source, index) => (
                  <div
                    key={source}
                    className={`py-3.5 ${index % 2 === 0 ? "sm:pr-6" : "sm:border-l sm:border-zinc-200 sm:pl-6 dark:sm:border-white/10"}`}
                  >
                    {source}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 py-10 sm:py-14 md:grid-cols-[5rem_1fr]">
            <div className="text-sm font-bold tracking-[0.2em] text-red-500">02</div>
            <div>
              <h2 className="text-3xl font-bold tracking-[-0.035em] text-zinc-950 dark:text-white">How course numbers work</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
                Every percentage names its denominator. If there are no usable outcomes, the page shows N/A.
              </p>
              <dl className="mt-7 border-t border-zinc-200 dark:border-white/10">
                {courseMetrics.map(([term, description]) => (
                  <div key={term} className="grid gap-1 border-b border-zinc-200 py-4 dark:border-white/10 sm:grid-cols-[11rem_1fr] sm:gap-6">
                    <dt className="font-semibold text-zinc-950 dark:text-white">{term}</dt>
                    <dd className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="grid gap-5 py-10 sm:py-14 md:grid-cols-[5rem_1fr]">
            <div className="text-sm font-bold tracking-[0.2em] text-red-500">03</div>
            <div>
              <h2 className="text-3xl font-bold tracking-[-0.035em] text-zinc-950 dark:text-white">Ratings and AI need context</h2>
              <div className="mt-7 grid gap-8 lg:grid-cols-2 lg:gap-0">
                <div className="lg:pr-10">
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Professor pages</h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                    Ratings, review count, department rank, and course history belong together. A high score with a tiny sample is a weaker signal.
                  </p>
                </div>
                <div className="border-t border-zinc-200 pt-8 dark:border-white/10 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0 dark:lg:border-white/10">
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Sparky</h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                    Sparky connects the available evidence into a quick answer. Use the linked course and professor pages when you want the details behind it.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5 py-10 sm:py-14 md:grid-cols-[5rem_1fr]">
            <div className="text-sm font-bold tracking-[0.2em] text-red-500">04</div>
            <div>
              <h2 className="text-3xl font-bold tracking-[-0.035em] text-zinc-950 dark:text-white">When to check UIC directly</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
                Confirm deadlines, tuition and bills, degree requirements, immigration rules, and other policy decisions with an official UIC source.
              </p>
              <p className="mt-6 text-sm font-medium text-red-600 dark:text-red-300">
                UIChicago helps you explore. Official UIC pages make the final call.
              </p>
            </div>
          </section>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
