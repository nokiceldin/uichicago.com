"use client"

import { useState } from "react"

export default function HelpPopup() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 h-10 w-10 rounded-full bg-emerald-500 text-white font-bold shadow-lg hover:bg-emerald-600"
      >
        ?
      </button>

            {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[320px] rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              About UICProf
            </h2>

            <button
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Close help"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            <p>
              UICProf helps students compare professors using ratings, classes taught, and course difficulty data.
            </p>
            <p>
              Use filters to search by department, course, or rating.
            </p>
            <p>
Built by a group of UIC students and engineers to help make course planning easier.            </p>
          </div>

          <div className="absolute bottom-[-8px] right-5 h-4 w-4 rotate-45 border-b border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950" />
        </div>
      )}
    </>
  )
}