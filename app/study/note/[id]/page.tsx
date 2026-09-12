import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Globe2, Lock } from "lucide-react";
import { getCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { serializeStudyNote } from "@/lib/study/server";

export const dynamic = "force-dynamic";

export default async function SharedStudyNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studyUser = await getCurrentStudyUser().catch(() => null);
  const record = await prisma.studyNote.findFirst({
    where: {
      id: decodeURIComponent(id),
      OR: [
        { visibility: "PUBLIC" },
        ...(studyUser ? [{ ownerId: studyUser.id }] : []),
      ],
    },
  });

  if (!record) notFound();
  const note = serializeStudyNote(record);
  const isGuide = note.sourceType === "imported";

  return (
    <main className="min-h-screen bg-transparent pb-20 text-white">
      <article className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
        <Link href="/study" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10">
          <ChevronLeft className="h-4 w-4" /> Back to My School
        </Link>

        <header className="mt-6 rounded-3xl border border-white/10 bg-[#171b42] p-6 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">
            <FileText className="h-4 w-4" />
            {isGuide ? "Study guide" : "Note"}
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${note.visibility === "public" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>
              {note.visibility === "public" ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {note.visibility === "public" ? "Public" : "Private"}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{note.title}</h1>
          <p className="mt-3 text-sm text-zinc-400">{[note.course, note.subject, note.noteDate].filter(Boolean).join(" · ")}</p>
        </header>

        <div className="mt-6 space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-zinc-200 sm:p-8">
          {note.structuredContent?.summary ? (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-300">Summary</h2>
              <p className="mt-3 whitespace-pre-wrap leading-7">{note.structuredContent.summary}</p>
            </section>
          ) : null}
          {note.structuredContent?.sections.map((section, index) => (
            <section key={`${section.heading}-${index}`} className="border-t border-white/10 pt-5">
              <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-7">
                {section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
              </ul>
            </section>
          ))}
          {note.rawContent || note.transcriptContent ? (
            <section className="border-t border-white/10 pt-5">
              <h2 className="text-lg font-semibold text-white">{isGuide ? "Source notes" : "Notes"}</h2>
              <p className="mt-3 whitespace-pre-wrap leading-7">{note.rawContent || note.transcriptContent}</p>
            </section>
          ) : null}
        </div>
      </article>
    </main>
  );
}
