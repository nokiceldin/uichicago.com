"use client"

import { useState } from "react"

export default function HelpPopup() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 h-11 w-11 rounded-full bg-emerald-500 text-white font-black shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-all hover:scale-105 active:scale-95 text-lg"
        aria-label="Help"
      >
        ?
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-20 right-6 z-50 w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-200 dark:border-white/10 dark:bg-zinc-900/95 dark:shadow-black/50 backdrop-blur-xl">
            <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">About UIC Ratings</h2>
                </div>
                <button onClick={() => setOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs" aria-label="Close">✕</button>
              </div>
              <div className="space-y-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p>UIC Ratings helps students compare professors using ratings, classes taught, and course difficulty data.</p>
                <p>Use filters to search by department, course, or rating.</p>
                <p>Built to help make course planning easier.</p>
              </div>
              <div className="my-4 h-px bg-zinc-100 dark:bg-white/5" />
              <div className="flex items-center gap-2">
                <a href="mailto:uicratings@gmail.com" className="flex-1 rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-2 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400 ring-1 ring-zinc-200 dark:ring-white/8 transition hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200">Contact</a>
                <a href="/courses" className="flex-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-3 py-2 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/25 transition hover:bg-emerald-100 dark:hover:bg-emerald-500/25">Browse Courses</a>
              </div>
            </div>
            <div className="absolute -bottom-2 right-6 h-4 w-4 rotate-45 border-b border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" />
          </div>
        </>
      )}
    </>
  )
}