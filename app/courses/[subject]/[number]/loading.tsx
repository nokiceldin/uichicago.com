export default function CourseDetailLoading() {
  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 py-10">

        {/* Course header skeleton */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/50">
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-3 flex-1">
                <div className="h-5 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-9 w-2/3 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-4 w-1/3 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              </div>
              <div className="flex gap-4 shrink-0">
                <div className="h-16 w-24 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-16 w-24 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-16 w-24 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Grade distribution skeleton */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/50">
          <div className="p-6 sm:p-8">
            <div className="h-6 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-2" />
            <div className="h-4 w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-8" />
            <div className="flex items-center gap-8">
              <div className="h-48 w-48 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse shrink-0" />
              <div className="flex-1 grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick insights skeleton */}
        <div className="mt-6">
          <div className="h-7 w-36 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-4" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        </div>

        {/* Professor GPA table skeleton */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/50">
          <div className="p-6">
            <div className="h-6 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-2" />
            <div className="h-4 w-80 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-6" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-6 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-4 flex-1 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}