// app/components/MissingCourseButton.tsx
"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

type Props = {
  page?: string
  searchQuery?: string
  show?: boolean
}

export default function MissingCourseButton({
  page = "courses",
  searchQuery,
  show = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const [courseName, setCourseName] = useState(searchQuery || "")
  const [department, setDepartment] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  async function submit() {
    setStatus("sending")
    try {
      const res = await fetch("/api/missing-professor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
  professorName: courseName,
  department,
  classInput: courseName,
  notes,
  searchQuery,
  page,
}),
      })

      if (!res.ok) throw new Error("bad")
      setStatus("sent")
      setCourseName("")
      setDepartment("")
      setNotes("")
    } catch {
      setStatus("error")
    }
  }

  const modal = open ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Report something missing</h3>
          <button
            onClick={() => {
              setOpen(false)
              setStatus("idle")
            }}
            className="rounded-lg px-2 py-1 ring-1 ring-white/10 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm text-white/70">Course or class</label>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="ex: CS 301 or Calculus II"
              className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 ring-1 ring-white/10"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Department (optional)</label>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="ex: Computer Science"
              className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 ring-1 ring-white/10"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything that helps, spelling, course code, title, section, etc"
              className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 ring-1 ring-white/10"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={submit}
              disabled={status === "sending" || courseName.trim().length < 2}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Submit"}
            </button>

            {status === "sent" ? <span className="text-sm text-emerald-300">Sent, thank you</span> : null}
            {status === "error" ? <span className="text-sm text-red-300">Error, try again</span> : null}
          </div>
        </div>
      </div>
    </div>
  ) : null

  if (!show) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
      >
        Report missing course
      </button>

      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  )
}