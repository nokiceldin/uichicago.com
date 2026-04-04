"use client";

import { useEffect, useRef } from "react";

type ProfessorNoteModalProps = {
  open: boolean;
  professorName: string;
  note: string;
  pending?: boolean;
  error?: string;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function ProfessorNoteModal({
  open,
  professorName,
  note,
  pending = false,
  error = "",
  onNoteChange,
  onClose,
  onSubmit,
}: ProfessorNoteModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timeout);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#12141b] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Saved professor note</div>
        <h2 className="mt-3 text-xl font-bold text-white">{professorName}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Add an optional note for later. Press Enter to save fast, or leave it blank and save anyway.
        </p>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <input
            ref={inputRef}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Take next sem in CS 301"
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500/60 focus:ring-2 focus:ring-red-500/15"
          />
          {error ? <div className="mt-3 text-sm text-red-400">{error}</div> : null}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
