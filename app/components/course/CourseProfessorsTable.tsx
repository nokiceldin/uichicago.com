import Link from "next/link";

type InstructorRow = {
  instructorName: string;
  displayName: string;
  slug: string | null;
  quality: number | null;
  ratingsCount: number | null;
  totalRegs: number;
  a: number;
  b: number;
  c: number;
  d: number;
  f: number;
  w: number;
};

export default function CourseProfessorsTable({
  instructors,
}: {
  instructors: InstructorRow[];
}) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-xl">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
          Professors Who Teach This Course
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sorted by total registrations in this course
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10">
        <div className="grid grid-cols-12 border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300">
          <div className="col-span-5">Professor</div>
          <div className="col-span-3 text-right">RMP Rating</div>
          <div className="col-span-2 text-right">Ratings</div>
          <div className="col-span-2 text-right">Total regs</div>
        </div>

        <ul>
          {instructors.map((row, idx) => (
            <li
              key={`${row.instructorName}-${idx}`}
              className="grid grid-cols-12 items-center border-b border-zinc-100 px-5 py-4 text-sm last:border-b-0 dark:border-white/5"
            >
              <div className="col-span-5">
                {row.slug ? (
                  <Link
                    href={`/professors/${row.slug}`}
                    className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {row.displayName}
                  </Link>
                ) : (
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {row.displayName}
                  </span>
                )}

                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {row.slug ? "Linked to professor page" : "No matched professor page yet"}
                </div>
              </div>

              <div className="col-span-3 flex justify-end">
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
                  {row.quality == null ? "No data" : row.quality.toFixed(1)}
                </span>
              </div>

              <div className="col-span-2 flex justify-end">
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
                  {row.ratingsCount == null ? "0" : row.ratingsCount}
                </span>
              </div>

              <div className="col-span-2 flex justify-end">
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
                  {new Intl.NumberFormat("en-US").format(row.totalRegs)}
                </span>
              </div>
            </li>
          ))}

          {instructors.length === 0 ? (
            <li className="px-5 py-10 text-sm text-zinc-600 dark:text-zinc-400">
              No instructor data available for this course.
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}