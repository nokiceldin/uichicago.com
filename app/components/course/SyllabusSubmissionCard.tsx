"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";

type Props = {
  courseCode: string;
  courseTitle: string;
  department?: string | null;
};

export default function SyllabusSubmissionCard({ courseCode, courseTitle, department }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [term, setTerm] = useState("");
  const [instructor, setInstructor] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const canSubmit = useMemo(() => !!file && status !== "sending", [file, status]);

  async function submit() {
    if (!file) {
      setStatus("error");
      setErrorMessage("Please attach a syllabus file first.");
      return;
    }

    setStatus("sending");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("courseCode", courseCode);
      formData.append("courseTitle", courseTitle);
      formData.append("department", department || "");
      formData.append("term", term);
      formData.append("instructor", instructor);
      formData.append("notes", notes);
      formData.append("file", file);

      const response = await fetch("/api/syllabus-submission", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to submit syllabus.");
      }

      posthog.capture("syllabus_submitted", {
        course_code: courseCode,
        has_term: !!term.trim(),
        has_instructor: !!instructor.trim(),
        file_type: file.type || "unknown",
      });

      setStatus("sent");
      setTerm("");
      setInstructor("");
      setNotes("");
      setFile(null);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit syllabus.");
    }
  }

  const modal = open ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-[1.6rem] border border-white/10 bg-zinc-950 p-5 shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Send in a syllabus</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Help students by sending the syllabus for <span className="font-medium text-zinc-200">{courseCode}</span>.
              Upload a PDF, screenshot, or document and submit it directly here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-white/10 bg-white/4 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/8 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm text-zinc-400">Course</label>
            <input
              value={`${courseCode} - ${courseTitle}`}
              readOnly
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-white outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400">Term (optional)</label>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Fall 2026"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-400">Instructor (optional)</label>
            <input
              value={instructor}
              onChange={(event) => setInstructor(event.target.value)}
              placeholder="Professor name if you know it"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-400">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything helpful, like section, semester, or whether it is the latest version"
              rows={4}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-400">Syllabus file *</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setStatus("idle");
                setErrorMessage("");
              }}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-200"
            />
            <p className="mt-1 text-xs text-zinc-500">
              PDF is best, but screenshots and common document files also work.
            </p>
            {file ? (
              <div className="mt-2 text-sm text-zinc-300">
                Attached: <span className="font-medium text-white">{file.name}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "sending" ? "Sending..." : "Submit syllabus"}
          </button>
          <span
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm font-semibold text-zinc-200"
          >
            uicratings@gmail.com
          </span>
          {status === "sent" ? <span className="text-sm text-emerald-300">Sent, thank you.</span> : null}
          {status === "error" ? <span className="text-sm text-red-300">{errorMessage || "Failed to send syllabus."}</span> : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-900/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Syllabus</div>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-white">Help build the syllabus library</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              We do not have a syllabus for this course in the data yet. If you have one, send it in and help future students find the exact class materials faster.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            Send in syllabus
          </button>
        </div>
      </section>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
