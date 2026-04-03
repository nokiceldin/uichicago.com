export default function CoursesLoading() {
  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 py-10">

        {/* Filters skeleton */}
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="h-9 w-36 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="h-9 w-28 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="h-9 w-32 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="ml-auto h-9 w-24 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        </div>

        {/* Table skeleton */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/50">
          {/* Header */}
          <div className="grid grid-cols-12 bg-zinc-50 dark:bg-zinc-950/50 px-5 py-3 gap-4">
            <div className="col-span-2 h-3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="col-span-5 h-3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="col-span-2 h-3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="col-span-2 h-3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="col-span-1 h-3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>

          {/* Rows */}
          <div className="divide-y divide-zinc-100 dark:divide-white/4">
            {[...Array(15)].map((_, i) => (
              <div key={i} className="grid grid-cols-12 items-center px-5 py-4 gap-4">
                <div className="col-span-2 h-4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="col-span-5 h-4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="col-span-2 h-4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="col-span-2 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="col-span-1 h-4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}