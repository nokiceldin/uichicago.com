"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import ProfessorNoteModal from "@/app/components/saved/ProfessorNoteModal";
import SaveProfessorButton from "@/app/components/saved/SaveProfessorButton";
import { UNAUTHORIZED_ERROR, useSavedItems } from "@/app/hooks/useSavedItems";

type SaveProfessorControlProps = {
  professor: {
    slug: string;
    name: string;
    department?: string;
    school?: string;
  };
  compact?: boolean;
};

export default function SaveProfessorControl({ professor, compact = false }: SaveProfessorControlProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const callbackUrl = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const { savedProfessorSlugs, savedProfessorNotes, saveProfessor, sessionStatus, unsaveProfessor } = useSavedItems();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [draftNote, setDraftNote] = useState("");

  const isSaved = savedProfessorSlugs.has(professor.slug);
  const savedNote = savedProfessorNotes.get(professor.slug) ?? null;

  async function handleToggle(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (sessionStatus === "loading") {
      return;
    }

    setPending(true);
    setError("");
    try {
      if (isSaved) {
        await unsaveProfessor(professor.slug);
        return;
      }
      setDraftNote(savedNote ?? "");
      setNoteModalOpen(true);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.message === UNAUTHORIZED_ERROR) {
        await signIn("google", { callbackUrl });
        return;
      }
      setError(nextError instanceof Error ? nextError.message : "Could not save professor.");
    } finally {
      setPending(false);
    }
  }

  async function handleModalSubmit() {
    setPending(true);
    setError("");
    try {
      await saveProfessor({
        professorSlug: professor.slug,
        professorName: professor.name,
        department: professor.department,
        school: professor.school,
        note: draftNote,
      });
      setNoteModalOpen(false);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.message === UNAUTHORIZED_ERROR) {
        setNoteModalOpen(false);
        await signIn("google", { callbackUrl });
        return;
      }
      setError(nextError instanceof Error ? nextError.message : "Could not save professor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SaveProfessorButton
        isSaved={isSaved}
        pending={pending}
        savedNote={savedNote}
        error={error}
        onToggle={handleToggle}
        compact={compact}
      />
      <ProfessorNoteModal
        open={noteModalOpen}
        professorName={professor.name}
        note={draftNote}
        pending={pending}
        error={error}
        onNoteChange={setDraftNote}
        onClose={() => {
          if (pending) return;
          setNoteModalOpen(false);
          setError("");
        }}
        onSubmit={handleModalSubmit}
      />
    </>
  );
}
