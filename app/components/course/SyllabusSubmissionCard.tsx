type Props = {
  courseCode: string;
  courseTitle: string;
  department?: string | null;
};

export default function SyllabusSubmissionCard({ courseCode, courseTitle }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-900/40">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Syllabus</div>
        <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-white">Syllabus library coming soon</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          We do not have a syllabus for {courseCode} - {courseTitle} in the data yet.
        </p>
      </div>
    </section>
  );
}
