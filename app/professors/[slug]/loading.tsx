export default function ProfessorLoading() {
  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">

        {/* Profile card skeleton */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/50">
          <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-6">
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-8 w-2/3 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-4 w-1/3 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-6 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-6 w-32 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-6 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                </div>
              </div>
            </div>

            {/* Summary skeleton */}
            <div className="mt-6 rounded-xl border border-zinc-100 dark:border-white/8 bg-zinc-50 dark:bg-white/[0.03] p-5 space-y-2">
              <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-4 w-4/6 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            </div>

            {/* Department/School skeleton */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            </div>

            {/* Button skeleton */}
            <div className="mt-5 h-10 w-48 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>

        {/* Course rankings skeleton */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/40">
          <div className="border-b border-zinc-100 dark:border-white/8 px-5 py-5 sm:px-6">
            <div className="h-6 w-40 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="mt-2 h-4 w-64 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 sm:px-6 py-4 gap-4">
                <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-4 flex-1 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-6 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}